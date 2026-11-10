// Render del terreno con "geometry clipmaps": anillos concéntricos de rejilla centrados en la
// cámara, con morphing entre niveles (sin grietas) y desplazamiento por textura de alturas.
import { GLSL_HEADER, FULLSCREEN_VS, Program, createTexture, createFBO, bindFBO, drawFullscreen, createMesh } from '../core/gl.js';
import { GLSL_HASH } from './glslNoise.js';
import { GLSL_HEIGHT_CODEC, WORLD_SIZE, WORLD_MIN } from './terrainGen.js';
import { GLSL_ATMO_SCENE, EARTH_RADIUS } from './atmosphere.js';
import { GLSL_SEA_LEVEL } from './ocean.js';
import { GLSL_CLOUD_SHADOW } from './clouds.js';

export const NUM_LEVELS = 9;

// Uniforms y funciones comunes para muestrear los mapas del terreno desde cualquier shader.
export const GLSL_TERRAIN_SAMPLING = /* glsl */`
uniform sampler2D uHeightTex;
uniform sampler2D uNormalTex;
uniform sampler2D uTerrShadow;
uniform vec4 uTerr; // x: origen (mín. mundo), y: tamaño de texel, z: N, w: tamaño del mundo
${GLSL_HEIGHT_CODEC}
vec2 terrUV(vec2 w) { return ((w - uTerr.x) / uTerr.y + 0.5) / uTerr.z; }
float terrHeightLod(vec2 w, float lod) { return decodeH(textureLod(uHeightTex, terrUV(w), lod)); }
float terrHeight(vec2 w) { return decodeH(texture(uHeightTex, terrUV(w))); }
// Sombra solar del relieve (0 = en sombra).
float terrainShadow(vec2 w) { return texture(uTerrShadow, terrUV(w)).r; }
`;

const VS = `${GLSL_HEADER}
layout(location = 0) in vec2 aGrid;
${GLSL_TERRAIN_SAMPLING}
uniform mat4 uViewProj;
uniform vec4 uLevel;      // xy: centro ajustado (mundo xz), z: tamaño de celda, w: M
uniform vec3 uCenterRel;  // xy: centro - cámara (xz), z: altitud de la cámara
uniform vec2 uLods;       // lod propio, lod del nivel más grueso (-1 = Catmull-Rom)
out vec3 vRel;
out vec3 vWorld;          // xz mundo, y altura

vec4 crW(float t) {
  float t2 = t * t, t3 = t2 * t;
  return vec4(-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2);
}
float hTexel(ivec2 c) { return decodeH(texelFetch(uHeightTex, clamp(c, ivec2(0), ivec2(int(uTerr.z) - 1)), 0)); }
float sampleCR(vec2 w) {
  vec2 f = (w - uTerr.x) / uTerr.y;
  vec2 i = floor(f), t = f - i;
  ivec2 ic = ivec2(i);
  vec4 wx = crW(t.x), wz = crW(t.y);
  float r = 0.0;
  for (int j = 0; j < 4; j++) {
    float row = 0.0;
    for (int k = 0; k < 4; k++) row += hTexel(ic + ivec2(k - 1, j - 1)) * wx[k];
    r += row * wz[j];
  }
  return r;
}
float sampleH(vec2 w, float lod) { return lod < 0.0 ? sampleCR(w) : terrHeightLod(w, lod); }

void main() {
  float M = uLevel.w, cell = uLevel.z;
  vec2 g = aGrid - M * 0.5;
  vec2 rel0 = g * cell + uCenterRel.xy;
  float d = max(abs(rel0.x), abs(rel0.y)) / ((M * 0.5 - 2.0) * cell);
  float k = clamp((d - 0.72) / 0.26, 0.0, 1.0);
  vec2 odd = mod(aGrid, 2.0);
  vec2 gm = g - odd * k;                     // los vértices impares se funden con el par anterior
  vec2 w = uLevel.xy + gm * cell;
  float h = sampleH(w, uLods.x);
  if (k > 0.0) h = mix(h, sampleH(w, uLods.y), k);
  vec2 rxz = gm * cell + uCenterRel.xy;
  float drop = dot(rxz, rxz) / (2.0 * ${EARTH_RADIUS.toFixed(1)});
  vRel = vec3(rxz.x, h - uCenterRel.z - drop, rxz.y);
  vWorld = vec3(w.x, h, w.y);
  gl_Position = uViewProj * vec4(vRel, 1.0);
}`;

const FS = `${GLSL_HEADER}
${GLSL_HASH}
${GLSL_TERRAIN_SAMPLING}
${GLSL_ATMO_SCENE}
${GLSL_SEA_LEVEL}
${GLSL_CLOUD_SHADOW}
uniform sampler2D uNoiseTex;
uniform sampler2D uDetailN;
uniform vec4 uDebug;
in vec3 vRel;
in vec3 vWorld;
out vec4 o;

void main() {
  float h = vWorld.y;
  vec2 p = vWorld.xz;
  float sea = seaLevelAt(p);
  if (h < sea - 0.03) discard;
  float dist = length(vRel);
  vec4 nt = texture(uNormalTex, terrUV(p));
  vec3 N;
  N.xz = nt.rg * 2.0 - 1.0;
  N.y = sqrt(max(1.0 - dot(N.xz, N.xz), 0.0001));
  float ao = nt.b, forest = nt.a;
  float slope = 1.0 - N.y;

  vec4 n1 = texture(uNoiseTex, p / 2900.0);
  vec4 n2 = texture(uNoiseTex, p / 431.0);
  vec4 n3 = texture(uNoiseTex, p / 53.0);
  vec4 n4 = texture(uNoiseTex, p / 6.7);

  // ---- pesos de materiales ----
  float rockW = smoothstep(0.24, 0.46, slope + (n2.r - 0.5) * 0.22 + (n3.b - 0.5) * 0.12);
  float snowLine = 1720.0 + (n1.r - 0.5) * 500.0;
  float snowW = smoothstep(snowLine - 160.0, snowLine + 120.0, h + (n2.b - 0.5) * 120.0)
              * (1.0 - smoothstep(0.38, 0.66, slope + (n3.r - 0.5) * 0.16));
  float alpine = smoothstep(1050.0, 1650.0, h + (n1.b - 0.5) * 400.0);
  float sandW = (1.0 - smoothstep(2.2, 5.5, h + (n2.r - 0.5) * 3.0)) * (1.0 - smoothstep(0.08, 0.2, slope));
  float forestW = smoothstep(0.35, 0.6, forest + (n3.g - 0.5) * 0.25) * (1.0 - rockW) * (1.0 - sandW);

  // ---- albedos (lineal) ----
  vec3 grassLush = vec3(0.060, 0.098, 0.026), grassDry = vec3(0.150, 0.140, 0.058);
  float dry = clamp(n1.g * 1.3 - 0.25 + (n2.b - 0.5) * 0.5 + alpine * 0.45, 0.0, 1.0);
  vec3 grass = mix(grassLush, grassDry, dry) * (0.72 + 0.56 * n3.b) * (0.85 + 0.3 * n4.r);
  vec3 soil = vec3(0.135, 0.098, 0.064) * (0.7 + 0.6 * n3.r);
  grass = mix(grass, soil, smoothstep(0.55, 0.9, n2.b * 0.7 + n3.r * 0.5) * 0.45);
  vec3 scree = vec3(0.21, 0.195, 0.175) * (0.75 + 0.5 * n3.b);
  grass = mix(grass, scree, alpine * smoothstep(0.3, 0.8, n2.g + alpine * 0.5));
  float strata = 0.5 + 0.5 * sin(h * 0.055 + n2.r * 9.0 + n1.b * 14.0);
  vec3 rock = mix(vec3(0.115, 0.108, 0.10), vec3(0.235, 0.215, 0.19), n2.g * 0.6 + strata * 0.4);
  rock = mix(rock, vec3(0.20, 0.165, 0.125), smoothstep(0.45, 0.8, n1.b) * 0.6);
  rock *= 0.62 + 0.5 * n3.a + 0.3 * n4.a * n4.b;
  vec3 forestC = mix(vec3(0.016, 0.038, 0.012), vec3(0.040, 0.068, 0.018), n2.b * 0.7 + n1.g * 0.3);
  forestC *= 0.55 + 0.9 * n3.g * n3.g + 0.25 * n4.g;
  vec3 sand = mix(vec3(0.50, 0.43, 0.31), vec3(0.42, 0.37, 0.28), n3.r) * (0.9 + 0.2 * n4.b);
  float wet = 1.0 - smoothstep(0.05, 0.75, h - sea);
  sand = mix(sand, sand * vec3(0.42, 0.42, 0.45), wet);
  vec3 snow = vec3(0.86, 0.88, 0.92);

  vec3 alb = grass;
  alb = mix(alb, forestC, forestW);
  alb = mix(alb, rock, rockW);
  alb = mix(alb, sand, sandW);
  alb = mix(alb, snow, snowW);

  // ---- normal de detalle ----
  vec4 d2 = texture(uDetailN, p / 197.0) * 2.0 - 1.0;
  vec4 d3 = texture(uDetailN, p / 23.0) * 2.0 - 1.0;
  vec4 d4 = texture(uDetailN, p / 3.1) * 2.0 - 1.0;
  float nearK = 1.0 - smoothstep(60.0, 400.0, dist);
  vec2 soft = d2.xy * 0.20 + d3.xy * 0.22 + d4.xy * 0.25 * nearK;
  vec2 hard = d2.zw * 0.55 + d3.zw * 0.5 + d4.zw * 0.4 * nearK;
  vec2 canopy = (texture(uDetailN, p / 61.0).zw * 2.0 - 1.0) * 0.75 + d3.zw * 0.5;
  vec2 dn = mix(soft, hard, rockW);
  dn = mix(dn, canopy, forestW);
  dn *= 1.0 - snowW * 0.7;
  dn *= 1.0 - sandW * 0.6;
  vec3 Nd = normalize(N + vec3(dn.x, 0.0, dn.y) * (0.55 + 0.6 * slope));

  // ---- iluminación ----
  float cs = cloudShadow(vWorld);
  float shadow = terrainShadow(p) * cs;
  vec3 sunT = lightTransmittance(h, uSunDir.y);
  float nl = max(dot(Nd, uSunDir), 0.0);
  // El dosel del bosque se autosombrea con sol bajo.
  float canopyShade = mix(1.0, 0.55 + 0.45 * smoothstep(0.0, 0.7, uSunDir.y), forestW);
  vec3 direct = uSunE * sunT * (nl * shadow * canopyShade);
  vec3 moonT = lightTransmittance(h, uMoonDir.y);
  direct += uMoonE * moonT * max(dot(Nd, uMoonDir), 0.0);
  float aoD = ao * (0.8 + 0.2 * mix(1.0, n3.g, forestW));
  vec3 amb = skyIrradiance(Nd) * aoD * mix(0.6, 1.0, cs);
  // Rebote difuso aproximado del terreno circundante.
  amb += uSunE * sunT * max(uSunDir.y, 0.0) * 0.035 * (1.0 - ao * 0.5) * (1.0 - N.y * 0.6);
  vec3 col = alb / PI * (direct + amb);
  if (uDebug.x > 0.5) col = vec3(0.18) / PI * (direct + amb);
  col = applyAP(col, vRel);
  o = vec4(col, 1.0);
}`;

// Sombras del relieve: marcha por el mapa de alturas hacia el sol (se rehornea al moverse el sol).
const FS_SHADOW = `${GLSL_HEADER}
${GLSL_HEIGHT_CODEC}
uniform sampler2D uHeightTex;
uniform vec3 uLightDir;
uniform vec4 uP; // x: tamaño de texel del mapa de alturas, y: N alturas, z: altura máx., w: res sombra
out vec4 o;
float H(vec2 uv, float lod) { return decodeH(textureLod(uHeightTex, uv, lod)); }
void main() {
  vec2 uv = gl_FragCoord.xy / uP.w;
  float hl = length(uLightDir.xz);
  if (uLightDir.y <= 0.002) { o = vec4(0.0); return; }
  if (hl < 1e-4) { o = vec4(1.0); return; }
  vec2 dir = uLightDir.xz / hl;
  float tanEl = uLightDir.y / hl;
  float texel = uP.x;
  float h0 = H(uv, 0.0) + 0.6;
  float t = texel * 1.2;
  float res = 1.0;
  const float PEN = 0.035;   // semiapertura del cono de penumbra
  for (int i = 0; i < 72; i++) {
    float rayH = h0 + t * tanEl;
    if (rayH > uP.z) break;
    float lod = clamp(log2(t * PEN * 2.0 / texel), 0.0, 6.0);
    float hs = H(uv + dir * (t / (texel * uP.y)), lod);
    res = min(res, (rayH - hs) / (t * PEN) + 0.5);
    if (res <= 0.0) break;
    t += max(texel * 0.9, t * 0.075);
  }
  o = vec4(clamp(res, 0.0, 1.0));
}`;

function buildGrid(gl, M) {
  const n = M + 1;
  const verts = new Float32Array(n * n * 2);
  let k = 0;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) { verts[k++] = x; verts[k++] = z; }
  const variants = [];
  const make = (ox, oz, hole) => {
    const idx = [];
    for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) {
      if (hole && x >= M / 4 + ox && x < (3 * M) / 4 + ox && z >= M / 4 + oz && z < (3 * M) / 4 + oz) continue;
      const a = z * n + x, b = a + 1, c = a + n, d = c + 1;
      // diagonal alterna para un mallado isótropo
      if ((x + z) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    return new Uint32Array(idx);
  };
  variants.push(make(0, 0, false));
  for (let oz = 0; oz < 2; oz++) for (let ox = 0; ox < 2; ox++) variants.push(make(ox, oz, true));
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  // Un único buffer de índices con todas las variantes.
  const total = variants.reduce((s, v) => s + v.length, 0);
  const all = new Uint32Array(total);
  const ranges = [];
  let off = 0;
  for (const v of variants) { all.set(v, off); ranges.push([off, v.length]); off += v.length; }
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, all, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, ranges };
}

export class Terrain {
  constructor(gl, data, detail, M = 128) {
    this.gl = gl;
    this.data = data;
    this.detail = detail;
    this.M = M;
    this.cell0 = 384 / M;
    this.grid = buildGrid(gl, M);
    this.prog = new Program(gl, VS, FS, 'terrain');
    this.shadowRes = Math.min(2048, data.N / 2);
    this.shadowTex = createTexture(gl, { width: this.shadowRes, height: this.shadowRes, format: 'r8', filter: 'linear', wrap: 'clamp' });
    this.shadowFBO = createFBO(gl, [this.shadowTex]);
    this.shadowProg = new Program(gl, FULLSCREEN_VS, FS_SHADOW, 'terrShadow');
    this.shadowDir = [0, 0, 0];
    this.debug = [0, 0, 0, 0];
    this.trisDrawn = 0;
  }

  // Rehornea la sombra del relieve si la luz se movió lo suficiente.
  updateShadow(lightDir, force = false) {
    const d = this.shadowDir;
    const dot = d[0] * lightDir[0] + d[1] * lightDir[1] + d[2] * lightDir[2];
    if (!force && dot > 0.99999) return false; // ~0.25°
    const gl = this.gl;
    this.shadowDir = [lightDir[0], lightDir[1], lightDir[2]];
    bindFBO(gl, this.shadowFBO);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    this.shadowProg.use().set('uHeightTex', this.data.heightTex).set('uLightDir', lightDir)
      .set('uP', this.data.texel, this.data.N, this.data.maxHeight + 5, this.shadowRes);
    drawFullscreen(gl);
    return true;
  }

  // Asigna las texturas del terreno a un programa que incluya GLSL_TERRAIN_SAMPLING.
  bindSampling(prog) {
    const d = this.data;
    prog.set('uHeightTex', d.heightTex).set('uNormalTex', d.normalTex).set('uTerrShadow', this.shadowTex)
      .set('uTerr', d.originX, d.texel, d.N, d.texel * d.N);
  }

  // ctx: contexto del frame; clearance: distancia aproximada al terreno (elige el nivel más fino).
  render(ctx, clearance) {
    const { cam, atmosphere, viewport, ocean, env, clouds } = ctx;
    const gl = this.gl, M = this.M, p = this.prog;
    p.use();
    this.bindSampling(p);
    atmosphere.bind(p, viewport);
    clouds.bindShadow(p, env.primaryLight);
    p.set('uNoiseTex', this.detail.noise).set('uDetailN', this.detail.normal);
    p.set('uViewProj', cam.viewProj).set('uDebug', this.debug);
    p.set('uSea', ocean.seaUniform(env));
    gl.bindVertexArray(this.grid.vao);
    const first = Math.max(0, Math.min(5, Math.floor(Math.log2(Math.max(clearance, 1) / (125 * this.cell0)))));
    const texel = this.data.texel;
    const lodOf = (c) => (c < texel * 0.999 ? -1 : Math.log2(c / texel));
    let tris = 0;
    for (let L = first; L < NUM_LEVELS; L++) {
      const cell = this.cell0 * 2 ** L;
      const sx = Math.floor(cam.pos[0] / (2 * cell)) * 2 * cell, sz = Math.floor(cam.pos[2] / (2 * cell)) * 2 * cell;
      p.set('uLevel', sx, sz, cell, M);
      p.set('uCenterRel', sx - cam.pos[0], sz - cam.pos[2], cam.pos[1]);
      p.set('uLods', lodOf(cell), lodOf(cell * 2));
      let variant = 0;
      if (L > first) {
        const ox = ((Math.floor(cam.pos[0] / cell) % 2) + 2) % 2, oz = ((Math.floor(cam.pos[2] / cell) % 2) + 2) % 2;
        variant = 1 + ox + oz * 2;
      }
      const [off, count] = this.grid.ranges[variant];
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, off * 4);
      tris += count / 3;
    }
    this.trisDrawn = tris;
    gl.bindVertexArray(null);
  }
}

export { WORLD_SIZE, WORLD_MIN };
