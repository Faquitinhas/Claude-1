// Generación procedural del terreno en GPU ("bake"): mapa de alturas de una isla con
// cordillera, volcán y erosión, más normales, oclusión ambiental y máscara de bosque.
//
// Proceso (todo en fragment shaders, por pases):
//   1. Relieve base suave a gran escala (isla, cordillera "ridged", volcán).
//   2. Erosión multi-octava: cada octava suma "ruido fasor" (núcleos de Gabor cuya fase se
//      combina) orientado según el gradiente del terreno acumulado hasta ese momento, de modo
//      que los barrancos pequeños desembocan en los grandes (drenaje dendrítico).
//   3. Erosión térmica (taludes) para relajar pendientes imposibles.
//   4. Playas, explanadas de aeródromos y codificación final.
//   5. Normales + oclusión ambiental + máscara de bosque.
// El resultado se lee a CPU para colisiones (misma interpolación Catmull-Rom que el shader).
import { GLSL_HEADER, FULLSCREEN_VS, Program, createTexture, createFBO, bindFBO, drawFullscreen, isRenderable, genMips } from '../core/gl.js';
import { GLSL_HASH, GLSL_NOISE } from './glslNoise.js';

export const WORLD_SIZE = 49152; // metros (lado del mapa)
export const WORLD_MIN = -WORLD_SIZE / 2;
export const SEA_LEVEL = 0;
export const MAX_AIRPORTS = 4;

// Parámetros de erosión (ajustables desde el laboratorio de terreno).
export const DEFAULT_TUNE = {
  cell: 4000,      // tamaño de celda de la primera octava (m)
  stripes: 1.7,    // crestas por celda
  octaves: 6,
  ampRatio: 0.066, // amplitud = ampRatio * longitud de onda
  gain: 0.95,      // factor de amplitud por octava (1 = proporcional a la longitud de onda)
  sharp: 0.36,     // 0 = senoidal, 1 = triangular (crestas y vaguadas afiladas)
  bias: 0.3,       // >0: excava más de lo que levanta
  lodBias: 0.0,
  thermal: 10,     // iteraciones de erosión térmica
  slopeRef: 0.35,  // pendiente a partir de la cual la erosión actúa con toda su amplitud
};

// Codificación de altura en dos canales half-float: R = múltiplo de 16 m, G = resto.
export const GLSL_HEIGHT_CODEC = /* glsl */`
vec2 encodeH(float h) { float c = floor(h / 16.0) * 16.0; return vec2(c, h - c); }
float decodeH(vec4 t) { return t.r + t.g; }
`;

const GLSL_BASE = /* glsl */`
float sdBox2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// fBm "ridged" con realimentación (multifractal): crestas afiladas y valles redondeados.
float ridged(vec2 p, int oct, float gain) {
  float a = 0.5, s = 0.0, w = 1.0, t = 0.0;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < oct; i++) {
    float n = 1.0 - abs(noise2(p) * 1.5);
    n = n * n * w;
    w = clamp(n * 1.6, 0.0, 1.0);
    s += a * n; t += a;
    p = m * p * 2.07 + 13.1;
    a *= gain;
  }
  return s / t;
}

// Campo "tierra adentro": >0 tierra, <0 mar. ~1 en el corazón de la isla.
float landField(vec2 pk) {
  vec2 w = vec2(fbm(pk * 0.05 + vec2(1.7, 9.2), 4), fbm(pk * 0.05 + vec2(8.3, 2.8), 4));
  vec2 q = pk + w * 6.5;
  // Cuerpo principal (elipse rotada) + península sur + isla menor al este.
  vec2 a = rot2(0.42) * (q - vec2(-2.5, -1.5));
  float main = 1.0 - length(a / vec2(15.5, 10.0));
  vec2 b = rot2(-0.6) * (q - vec2(5.0, 9.0));
  float pen = 1.0 - length(b / vec2(7.5, 3.6));
  float e = smax(main, pen * 0.7, 0.22);
  vec2 c = q - vec2(17.0, -11.5);
  float isl = 1.0 - length(c / vec2(3.9, 3.3));
  e = smax(e, isl * 0.6, 0.1);
  // Bahía al suroeste y ensenada al norte.
  float bay = 1.0 - length((q - vec2(-8.5, 9.0)) / vec2(5.2, 4.2));
  e = smin(e, 0.40 - bay * 0.95, 0.16);
  float cove = 1.0 - length((q - vec2(1.0, -12.5)) / vec2(2.6, 3.4));
  e = smin(e, 0.5 - cove * 0.9, 0.14);
  e += fbm(pk * 0.11 + 4.0, 3) * 0.20 + fbm(pk * 0.45 + 14.0, 4) * 0.055;
  return e;
}

// Relieve base (metros): forma suave a gran escala; la erosión aporta el detalle.
float baseHeight(vec2 pm) {
  vec2 pk = pm * 0.001;
  float e = landField(pk);
  float h;
  if (e < 0.0) {
    h = e * 260.0 - 2600.0 * e * e;
    h = max(h, -380.0 + 50.0 * fbm(pk * 0.2, 3));
  } else {
    h = 60.0 * e + 380.0 * e * e;
  }
  // Cordillera: eje curvo que cruza la isla.
  vec2 w2 = vec2(fbm(pk * 0.06 + 31.0, 3), fbm(pk * 0.06 + 57.0, 3)) * 4.0;
  vec2 ps = pk + w2;
  float axis = ps.y + 2.0 - 0.02 * (ps.x + 2.0) * (ps.x + 2.0) + 3.0 * sin(ps.x * 0.17);
  float spine = exp(-axis * axis / (2.0 * 4.6 * 4.6));
  float inland = smoothstep(0.02, 0.36, e);
  float regional = 0.6 + 0.4 * smoothstep(-0.3, 0.3, fbm(pk * 0.07 + 91.0, 3));
  float mEnv = inland * (0.2 + 0.8 * spine) * regional;
  vec2 wr = vec2(fbm(pk * 0.16 + 5.0, 3), fbm(pk * 0.16 + 23.0, 3)) * 1.6;
  float r = ridged(pk * 0.085 + wr * 0.085 + 3.0, 4, 0.42);
  h += mEnv * (pow(r, 1.25) * 2500.0 + 80.0);
  // Colinas suaves en las tierras bajas.
  float low = smoothstep(0.0, 0.1, e) * (1.0 - mEnv * 0.85);
  h += low * (fbm(pk * 0.42 + 77.0, 4) * 60.0 + 30.0 * smoothstep(0.0, 0.3, e));
  // Estratovolcán con cráter en la isla menor.
  {
    vec2 vc = pk - vec2(17.2, -11.0);
    vc += vec2(fbm(pk * 0.5, 3), fbm(pk * 0.5 + 9.0, 3)) * 0.3;
    float rv = length(vc);
    float cone = 1250.0 * exp(-rv * 0.9) + 240.0 * exp(-rv * rv * 0.3);
    float crater = 260.0 * exp(-rv * rv * 20.0);
    h += (cone - crater) * smoothstep(-0.05, 0.12, e);
  }
  return h;
}
`;

const COMMON_U = /* glsl */`
uniform vec2 uWorldMin;
uniform float uTexel;
uniform float uN;
`;

const FS_BASE = `${GLSL_HEADER}${GLSL_HASH}${GLSL_NOISE}${GLSL_HEIGHT_CODEC}${GLSL_BASE}${COMMON_U}
out vec4 o;
void main() {
  vec2 pm = uWorldMin + (gl_FragCoord.xy - 0.5) * uTexel;
  o = vec4(encodeH(baseHeight(pm)), 0.0, 1.0);
}`;

// Gradiente a media resolución (dh/dx, dh/dz).
const FS_GRAD = `${GLSL_HEADER}${GLSL_HEIGHT_CODEC}${COMMON_U}
uniform sampler2D uH;
out vec4 o;
float H(ivec2 c) { return decodeH(texelFetch(uH, clamp(c, ivec2(0), ivec2(int(uN) - 1)), 0)); }
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy) * 2;
  float gx = (H(c + ivec2(2, 0)) + H(c + ivec2(2, 1)) - H(c + ivec2(-1, 0)) - H(c + ivec2(-1, 1))) / (6.0 * uTexel);
  float gz = (H(c + ivec2(0, 2)) + H(c + ivec2(1, 2)) - H(c + ivec2(0, -1)) - H(c + ivec2(1, -1))) / (6.0 * uTexel);
  o = vec4(gx, gz, 0.0, 1.0);
}`;

// Una octava de erosión por ruido fasor orientado.
const FS_ERODE = `${GLSL_HEADER}${GLSL_HASH}${GLSL_HEIGHT_CODEC}${COMMON_U}
uniform sampler2D uH;
uniform sampler2D uG;
uniform float uCell, uLod, uK, uAmp, uBias, uSharp, uSeed, uSlopeRef;
out vec4 o;
void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  float h = decodeH(texelFetch(uH, ic, 0));
  vec2 pm = uWorldMin + (gl_FragCoord.xy - 0.5) * uTexel;
  vec2 uv = gl_FragCoord.xy / uN;
  vec2 g0 = textureLod(uG, uv, uLod).rg;
  float s0 = length(g0);
  float amp = uAmp * smoothstep(0.0, uSlopeRef, s0) * smoothstep(1.0, 70.0, h);
  if (amp <= 0.0001) { o = vec4(encodeH(h), 0.0, 1.0); return; }
  vec2 pc = pm / uCell;
  vec2 base = floor(pc - 0.5);
  vec2 S = vec2(0.0);
  float wt = 0.0;
  for (int j = -1; j <= 2; j++) for (int i = -1; i <= 2; i++) {
    vec2 cell = base + vec2(float(i), float(j));
    vec3 rnd = hash33(vec3(cell, uSeed));
    vec2 cpos = cell + 0.5 + (rnd.xy - 0.5);          // centro del núcleo (en celdas)
    vec2 d = pc - cpos;
    float w = max(0.0, 1.0 - dot(d, d) / 2.25);
    w = w * w * w;
    if (w <= 0.0) continue;
    vec2 cw = cpos * uCell;                            // metros
    vec2 g = textureLod(uG, ((cw - uWorldMin) / uTexel + 0.5) / uN, uLod).rg;
    float sl = length(g);
    vec2 dirn = vec2(g.y, -g.x) / max(sl, 1e-5);       // a lo largo de la curva de nivel
    float kj = uK * mix(0.72, 1.38, hash31(vec3(cell, uSeed + 31.0)));   // separación irregular
    float ph = TAU * (dot(d, dirn) * kj + rnd.z);
    float ws = w * smoothstep(0.0, 0.16, sl);
    S += ws * vec2(cos(ph), sin(ph));
    wt += w;
  }
  float coh = length(S) / max(wt, 1e-4);
  float ph = atan(S.y, S.x);
  float t = ph / TAU;                                  // (-0.5, 0.5]
  float tri = 1.0 - 4.0 * abs(t);
  float v = mix(cos(ph), tri, uSharp) * smoothstep(0.0, 0.4, coh);
  h += amp * (v - uBias);
  o = vec4(encodeH(h), 0.0, 1.0);
}`;

// Erosión térmica: el material que supera el ángulo de reposo se desplaza ladera abajo.
const FS_THERMAL = `${GLSL_HEADER}${GLSL_HASH}${GLSL_NOISE}${GLSL_HEIGHT_CODEC}${COMMON_U}
uniform sampler2D uH;
out vec4 o;
float H(ivec2 c) { return decodeH(texelFetch(uH, clamp(c, ivec2(0), ivec2(int(uN) - 1)), 0)); }
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float h = H(c);
  vec2 pm = uWorldMin + (gl_FragCoord.xy - 0.5) * uTexel;
  // Ángulo de reposo variable: roca dura (paredes) frente a ladera suelta.
  float hard = smoothstep(-0.15, 0.35, fbm(pm * 0.0011 + 51.0, 3)) * smoothstep(300.0, 1400.0, h);
  float talus = mix(0.72, 1.9, hard);
  float sum = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    if (i == 0 && j == 0) continue;
    float dist = uTexel * length(vec2(float(i), float(j)));
    float d = H(c + ivec2(i, j)) - h;
    float T = talus * dist;
    sum += max(0.0, d - T) - max(0.0, -d - T);
  }
  h += sum * 0.07;
  o = vec4(encodeH(h), 0.0, 1.0);
}`;

const GLSL_AIRPORT_U = /* glsl */`
uniform int uNumAp;
uniform vec4 uApA[${MAX_AIRPORTS}]; // cx, cz, dirx, dirz
uniform vec4 uApB[${MAX_AIRPORTS}]; // semilargo, semiancho, elevación, distancia de mezcla
`;

// Pase final: microrrelieve, playas y explanadas de aeródromos.
const FS_FINAL = `${GLSL_HEADER}${GLSL_HASH}${GLSL_NOISE}${GLSL_HEIGHT_CODEC}${COMMON_U}${GLSL_AIRPORT_U}
uniform sampler2D uH;
out vec4 o;
float sdBox2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  float h = decodeH(texelFetch(uH, ivec2(gl_FragCoord.xy), 0));
  vec2 pm = uWorldMin + (gl_FragCoord.xy - 0.5) * uTexel;
  // Ondulación natural de pequeña escala (más en terreno alto).
  h += fbm(pm * 0.006 + 3.0, 4) * (1.5 + 5.0 * smoothstep(100.0, 1200.0, h)) * smoothstep(1.0, 25.0, h);
  // Franja costera: playas de pendiente suave.
  float sh = smoothstep(0.0, 10.0, abs(h));
  h *= mix(0.55, 1.0, sh);
  for (int i = 0; i < ${MAX_AIRPORTS}; i++) {
    if (i >= uNumAp) break;
    vec2 d = pm - uApA[i].xy;
    vec2 dir = uApA[i].zw;
    vec2 l = vec2(dot(d, dir), dot(d, vec2(-dir.y, dir.x)));
    float sd = sdBox2(l, uApB[i].xy);
    float k = 1.0 - smoothstep(0.0, uApB[i].w, sd);
    k = k * k * (3.0 - 2.0 * k);
    h = mix(h, uApB[i].z, k);
  }
  o = vec4(encodeH(h), 0.0, 1.0);
}`;

// Normal (RG), oclusión ambiental (B) y densidad de bosque (A).
const FS_NORMAL = `${GLSL_HEADER}${GLSL_HASH}${GLSL_NOISE}${GLSL_HEIGHT_CODEC}${COMMON_U}${GLSL_AIRPORT_U}
uniform sampler2D uHeight;
out vec4 o;
float H(ivec2 c) { return decodeH(texelFetch(uHeight, clamp(c, ivec2(0), ivec2(int(uN) - 1)), 0)); }
float Hl(vec2 uv, float lod) { return decodeH(textureLod(uHeight, uv, lod)); }
float sdBox2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 pm = uWorldMin + (gl_FragCoord.xy - 0.5) * uTexel;
  float h = H(c);
  float hl = H(c - ivec2(1, 0)), hr = H(c + ivec2(1, 0));
  float hd = H(c - ivec2(0, 1)), hu = H(c + ivec2(0, 1));
  vec3 n = normalize(vec3(hl - hr, 2.0 * uTexel, hd - hu));
  // Visibilidad del cielo basada en horizonte: 8 direcciones, pasos exponenciales sobre mips.
  vec2 uv = gl_FragCoord.xy / uN;
  float occ = 0.0;
  float rot = hash21(gl_FragCoord.xy);
  for (int d = 0; d < 8; d++) {
    float ang = (float(d) + rot) * (TAU / 8.0);
    vec2 dir = vec2(cos(ang), sin(ang));
    float maxT = 0.0, dist = 1.5;
    for (int s = 0; s < 7; s++) {
      float lod = max(0.0, log2(dist) - 1.0);
      float hs = Hl(uv + dir * dist / uN, lod);
      maxT = max(maxT, (hs - h) / (dist * uTexel));
      dist *= 2.0;
    }
    occ += maxT / sqrt(1.0 + maxT * maxT);
  }
  float ao = clamp(1.0 - occ / 8.0, 0.0, 1.0);
  ao = pow(ao, 1.5);
  // Bosque: por altitud, pendiente, humedad (ruido) y concavidad.
  vec2 pk = pm * 0.001;
  float slope = 1.0 - n.y;
  float moist = fbm(pk * 0.35 + 40.0, 4) * 0.5 + 0.5;
  float clump = fbm(pk * 2.2 + 12.0, 3) * 0.5 + 0.5;
  float tl = 1250.0 + 260.0 * fbm(pk * 0.25 + 70.0, 3);
  float f = smoothstep(4.0, 14.0, h) * (1.0 - smoothstep(tl - 220.0, tl, h));
  f *= 1.0 - smoothstep(0.2, 0.4, slope);
  float conc = Hl(uv, 3.0) - h;
  f *= smoothstep(0.28, 0.62, moist * 0.75 + clump * 0.35 + clamp(conc * 0.01, -0.15, 0.25) + 0.12);
  for (int i = 0; i < ${MAX_AIRPORTS}; i++) {
    if (i >= uNumAp) break;
    vec2 dd = pm - uApA[i].xy;
    vec2 dr = uApA[i].zw;
    vec2 l = vec2(dot(dd, dr), dot(dd, vec2(-dr.y, dr.x)));
    f *= smoothstep(120.0, 420.0, sdBox2(l, uApB[i].xy + vec2(250.0, 60.0)));
  }
  float dn = (hash21(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;
  o = vec4(n.x * 0.5 + 0.5 + dn, n.z * 0.5 + 0.5 - dn, ao, f);
}`;

const FS_PACK = `${GLSL_HEADER}${GLSL_HEIGHT_CODEC}
uniform sampler2D uHeight;
uniform ivec2 uOff;
out vec4 o;
void main() {
  float h = decodeH(texelFetch(uHeight, ivec2(gl_FragCoord.xy) + uOff, 0));
  uint q = uint(clamp((h + 1024.0) * 2048.0, 0.0, 16777215.0));
  o = vec4(float((q >> 16u) & 255u), float((q >> 8u) & 255u), float(q & 255u), 255.0) / 255.0;
}`;

const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

function setAirportUniforms(prog, airports) {
  const A = new Float32Array(MAX_AIRPORTS * 4), B = new Float32Array(MAX_AIRPORTS * 4);
  airports.slice(0, MAX_AIRPORTS).forEach((ap, i) => {
    const hd = (ap.heading * Math.PI) / 180;
    A.set([ap.x, ap.z, Math.sin(hd), -Math.cos(hd)], i * 4);
    B.set([ap.flatLen / 2, ap.flatWid / 2, ap.elev, ap.blend], i * 4);
  });
  prog.set('uNumAp', Math.min(airports.length, MAX_AIRPORTS));
  prog.set('uApA', A);
  prog.set('uApB', B);
}

export class TerrainData {
  constructor(gl, N) {
    this.gl = gl;
    this.N = N;
    this.texel = WORLD_SIZE / N;
    this.originX = WORLD_MIN;
    this.originZ = WORLD_MIN;
    this.tune = { ...DEFAULT_TUNE };
    this.heights = null; // Float32Array N*N
    this.hfmt = gl.caps.colorFloat && isRenderable(gl, 'rg16f') ? 'rg16f' : 'rgba16f';
    this.heightTex = createTexture(gl, { width: N, height: N, format: this.hfmt, mips: true, filter: 'linear', wrap: 'clamp' });
    this.normalTex = createTexture(gl, { width: N, height: N, format: 'rgba8', mips: true, filter: 'linear', wrap: 'clamp', aniso: 8 });
    this.maxHeight = 0;
  }

  // Hornea el terreno. airports: [{x,z,heading,flatLen,flatWid,elev,blend}]
  async bake(airports, onProgress = () => {}) {
    const gl = this.gl, N = this.N, tune = this.tune;
    const mk = (fs, name) => new Program(gl, FULLSCREEN_VS, fs, name);
    const common = (p) => p.use().set('uWorldMin', this.originX, this.originZ).set('uTexel', this.texel).set('uN', N);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

    const hA = this.heightTex;
    const hB = createTexture(gl, { width: N, height: N, format: this.hfmt, filter: 'nearest' });
    const gT = createTexture(gl, { width: N / 2, height: N / 2, format: this.hfmt, mips: true, filter: 'linear', wrap: 'clamp' });
    const fA = createFBO(gl, [hA]), fB = createFBO(gl, [hB]), fG = createFBO(gl, [gT]);
    if (!fA.ok || !fG.ok) throw new Error('El dispositivo no permite renderizar a texturas de media precisión flotante');

    // Dibuja un pase completo por baldosas (scissor), cediendo el hilo cada cierto número.
    const tiled = async (fbo, prog, tile, yieldEvery, cb) => {
      let k = 0;
      const total = Math.ceil(fbo.width / tile) * Math.ceil(fbo.height / tile);
      for (let y = 0; y < fbo.height; y += tile) for (let x = 0; x < fbo.width; x += tile) {
        bindFBO(gl, fbo);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x, y, tile, tile);
        prog.use();
        drawFullscreen(gl);
        gl.disable(gl.SCISSOR_TEST);
        k++;
        if (k % yieldEvery === 0) { gl.flush(); if (cb) cb(k / total); await nextFrame(); }
      }
    };

    // 1. Relieve base
    const pBase = mk(FS_BASE, 'bakeBase');
    common(pBase);
    await tiled(fA, pBase, 512, 4, (f) => onProgress(0.35 * f));
    let cur = hA, curF = fA, oth = hB, othF = fB;
    const swap = () => { [cur, oth] = [oth, cur]; [curF, othF] = [othF, curF]; };

    // 2. Erosión por octavas
    const pGrad = mk(FS_GRAD, 'bakeGrad');
    const pEro = mk(FS_ERODE, 'bakeErode');
    const computeGrad = () => {
      bindFBO(gl, fG);
      common(pGrad).set('uH', cur);
      drawFullscreen(gl);
      genMips(gl, gT);
    };
    let cell = tune.cell, ampMul = 1;
    for (let i = 0; i < tune.octaves; i++) {
      const lambda = cell / tune.stripes;
      if (lambda < this.texel * 3.2) break; // por debajo de la resolución del mapa
      computeGrad();
      const lod = Math.max(0, Math.log2(lambda / (4 * this.texel)) + tune.lodBias);
      common(pEro).set('uH', cur).set('uG', gT).set('uCell', cell).set('uLod', lod).set('uK', tune.stripes)
        .set('uAmp', tune.ampRatio * lambda * ampMul).set('uBias', tune.bias).set('uSharp', tune.sharp).set('uSeed', 17 + i * 7).set('uSlopeRef', tune.slopeRef);
      await tiled(othF, pEro, 1024, 8, null);
      swap();
      cell *= 0.5; ampMul *= tune.gain;
      onProgress(0.35 + 0.3 * (i + 1) / tune.octaves);
      await nextFrame();
    }

    // 3. Erosión térmica
    const pTh = mk(FS_THERMAL, 'bakeThermal');
    for (let i = 0; i < tune.thermal; i++) {
      common(pTh).set('uH', cur);
      await tiled(othF, pTh, 2048, 1000, null);
      swap();
      if (i % 4 === 3) { gl.flush(); await nextFrame(); }
    }

    // 4. Pase final (debe terminar en hA = heightTex)
    const pFin = mk(FS_FINAL, 'bakeFinal');
    if (cur === hA) {
      // copia intermedia: térmica "nula" no existe, así que se hace el final hacia hB y se copia.
      common(pFin).set('uH', cur); setAirportUniforms(pFin, airports);
      await tiled(othF, pFin, 2048, 1000, null);
      swap();
      const pCopy = mk(`${GLSL_HEADER}uniform sampler2D uH; out vec4 o; void main(){ o = texelFetch(uH, ivec2(gl_FragCoord.xy), 0); }`, 'copy');
      pCopy.use().set('uH', cur);
      await tiled(othF, pCopy, 2048, 1000, null);
      swap();
      gl.deleteProgram(pCopy.p);
    } else {
      common(pFin).set('uH', cur); setAirportUniforms(pFin, airports);
      await tiled(othF, pFin, 2048, 1000, null);
      swap();
    }
    genMips(gl, this.heightTex);
    onProgress(0.7);
    await nextFrame();

    // 5. Normales + AO + bosque
    const pN = mk(FS_NORMAL, 'bakeNormal');
    const fN = createFBO(gl, [this.normalTex]);
    common(pN).set('uHeight', this.heightTex); setAirportUniforms(pN, airports);
    await tiled(fN, pN, 512, 8, (f) => onProgress(0.7 + 0.15 * f));
    genMips(gl, this.normalTex);

    // 6. Lectura a CPU (RGBA8 empaquetado, 24 bits)
    const rt = Math.min(1024, N);
    const packTex = createTexture(gl, { width: rt, height: rt, format: 'rgba8', filter: 'nearest' });
    const fP = createFBO(gl, [packTex]);
    const pP = mk(FS_PACK, 'packHeight');
    const buf = new Uint8Array(rt * rt * 4);
    const H = new Float32Array(N * N);
    let maxH = -1e9, k = 0;
    const nt = (N / rt) * (N / rt);
    for (let ty = 0; ty < N; ty += rt) {
      for (let tx = 0; tx < N; tx += rt) {
        bindFBO(gl, fP);
        pP.use().set('uHeight', this.heightTex);
        gl.uniform2i(pP.u.uOff.loc, tx, ty);
        drawFullscreen(gl);
        gl.readPixels(0, 0, rt, rt, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        for (let y = 0; y < rt; y++) {
          let o = (ty + y) * N + tx, i = y * rt * 4;
          for (let x = 0; x < rt; x++, i += 4, o++) {
            const h = ((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2]) / 2048 - 1024;
            H[o] = h;
            if (h > maxH) maxH = h;
          }
        }
        k++;
        onProgress(0.85 + 0.15 * k / nt);
        if (k % 2 === 0) await nextFrame();
      }
    }
    this.heights = H;
    this.maxHeight = maxH;
    for (const f of [fA, fB, fG, fN, fP]) gl.deleteFramebuffer(f.fbo);
    for (const t of [hB, gT, packTex]) gl.deleteTexture(t.tex);
    for (const p of [pBase, pGrad, pEro, pTh, pFin, pN, pP]) gl.deleteProgram(p.p);
    bindFBO(gl, null);
  }

  // Altura por vecino más cercano (rápida, para análisis).
  heightNearest(x, z) {
    const N = this.N;
    let i = Math.round((x - this.originX) / this.texel), j = Math.round((z - this.originZ) / this.texel);
    i = i < 0 ? 0 : i >= N ? N - 1 : i; j = j < 0 ? 0 : j >= N ? N - 1 : j;
    return this.heights[j * N + i];
  }

  // Altura con interpolación bicúbica Catmull-Rom (idéntica a la del vertex shader).
  // Si out es un array, escribe además la normal [nx, ny, nz] en out.
  height(x, z, out) {
    const N = this.N, H = this.heights, t = this.texel;
    const fx = (x - this.originX) / t, fz = (z - this.originZ) / t;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    cr(tx, _wx); cr(tz, _wz);
    if (out) { crd(tx, _dx); crd(tz, _dz); }
    let h = 0, dx = 0, dz = 0;
    for (let j = 0; j < 4; j++) {
      let jj = iz + j - 1; jj = jj < 0 ? 0 : jj >= N ? N - 1 : jj;
      const row = jj * N;
      let r = 0, rd = 0;
      for (let i = 0; i < 4; i++) {
        let ii = ix + i - 1; ii = ii < 0 ? 0 : ii >= N ? N - 1 : ii;
        const v = H[row + ii];
        r += v * _wx[i];
        if (out) rd += v * _dx[i];
      }
      h += r * _wz[j];
      if (out) { dx += rd * _wz[j]; dz += r * _dz[j]; }
    }
    if (out) {
      dx /= t; dz /= t;
      const l = Math.hypot(dx, 1, dz);
      out[0] = -dx / l; out[1] = 1 / l; out[2] = -dz / l;
    }
    return h;
  }
}

const _wx = [0, 0, 0, 0], _wz = [0, 0, 0, 0], _dx = [0, 0, 0, 0], _dz = [0, 0, 0, 0];
function cr(t, o) {
  const t2 = t * t, t3 = t2 * t;
  o[0] = -0.5 * t3 + t2 - 0.5 * t; o[1] = 1.5 * t3 - 2.5 * t2 + 1; o[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; o[3] = 0.5 * t3 - 0.5 * t2;
}
function crd(t, o) {
  const t2 = t * t;
  o[0] = -1.5 * t2 + 2 * t - 0.5; o[1] = 4.5 * t2 - 5 * t; o[2] = -4.5 * t2 + 4 * t + 0.5; o[3] = 1.5 * t2 - t;
}
