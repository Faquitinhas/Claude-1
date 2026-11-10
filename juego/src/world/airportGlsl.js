// Aeródromos dibujados dentro del shader del terreno: asfalto, marcas de pista según OACI
// (umbral, números, eje, bordes, zona de contacto, punto de visada), rodajes y plataforma.
// Todo es analítico con antialiasing por derivadas: nítido a cualquier distancia.
import { createTexture, updateTexture } from '../core/gl.js';
import { AIRPORTS, MAX_RECTS, MAX_BOXES, airportBuildings } from './airports.js';

const NAP = 4;

export const GLSL_AIRPORT = /* glsl */`
uniform vec4 uApA[${NAP}];     // cx, cz, dirx, dirz
uniform vec4 uApB[${NAP}];     // semilargo, semiancho, elevación, 1 = pista principal
uniform vec4 uApNum[${NAP}];   // dígitos: cabecera 0 (decenas, unidades), cabecera 1 (decenas, unidades)
uniform vec4 uApRect[${NAP * MAX_RECTS}];   // centro along, centro across, semilargo, semiancho
uniform float uApRectT[${NAP * MAX_RECTS}]; // tipo
uniform sampler2D uDigitTex;

float apBox(vec2 p, vec2 c, vec2 h, vec2 w) {
  vec2 d = (h - abs(p - c)) / w + 0.5;
  return clamp(d.x, 0.0, 1.0) * clamp(d.y, 0.0, 1.0);
}
float apDigit(vec2 q, float d, vec2 w) {
  // q en [0,1]^2 dentro de la caja del dígito
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
  float a = texture(uDigitTex, vec2((d + q.x) / 10.0, q.y)).r;
  float aa = clamp(max(w.x, w.y) * 6.0, 0.02, 0.5);
  return smoothstep(0.5 - aa, 0.5 + aa, a);
}
// Marcas de una cabecera. u: distancia desde el extremo de pista (m), v: lateral (+ derecha del piloto).
float apEndMarks(float u, float v, float hw, float n10, float n1, float isMain, vec2 fw) {
  float m = 0.0;
  // barras de umbral ("teclas de piano")
  float keys = floor((hw - 1.5) / 3.6);
  float kx = abs(v) - 1.8;
  float ki = floor(kx / 3.6);
  float kf = kx - ki * 3.6;
  float key = clamp((0.9 - abs(kf - 0.9)) / fw.y + 0.5, 0.0, 1.0) * step(0.0, kx) * step(ki, keys - 0.5);
  m = max(m, key * apBox(vec2(u, 0.0), vec2(21.0, 0.0), vec2(15.0, 1e3), vec2(fw.x, 1.0)));
  // número de pista
  float dh = hw > 12.0 ? 12.0 : 9.0, dw = dh * 0.42;
  vec2 q0 = vec2((v + dw * 1.12) / dw, (u - 48.0) / dh);
  vec2 q1 = vec2((v - dw * 0.12) / dw, (u - 48.0) / dh);
  vec2 dfw = vec2(fw.y / dw, fw.x / dh);
  m = max(m, apDigit(q0, n10, dfw));
  m = max(m, apDigit(q1, n1, dfw));
  // punto de visada y zona de contacto (pista principal)
  if (isMain > 0.5) {
    m = max(m, apBox(vec2(u, abs(v)), vec2(322.0, hw * 0.52), vec2(22.5, 2.6), fw));
    for (int i = 0; i < 3; i++) {
      float uc = 161.0 + float(i) * 150.0 + (i >= 1 ? 150.0 : 0.0);
      m = max(m, apBox(vec2(u, abs(v)), vec2(uc, hw * 0.5), vec2(11.25, 0.9), fw));
      if (i < 1) m = max(m, apBox(vec2(u, abs(v)), vec2(uc, hw * 0.5 + 2.7), vec2(11.25, 0.9), fw));
    }
  } else {
    m = max(m, apBox(vec2(u, abs(v)), vec2(190.0, hw * 0.5), vec2(15.0, 1.6), fw));
  }
  return m;
}

// Devuelve el albedo del pavimento (rgb) y su cobertura (a). n: ruidos (macro, fino).
vec4 airportSurface(vec2 p, vec4 nMacro, vec4 nFine, vec4 nMicro, out float wetK) {
  vec4 res = vec4(0.0);
  wetK = 0.0;
  for (int i = 0; i < ${NAP}; i++) {
    vec4 A = uApA[i], B = uApB[i];
    vec2 d = p - A.xy;
    if (B.x <= 0.0 || abs(d.x) > B.x + 700.0 || abs(d.y) > B.x + 700.0) continue;
    vec2 l = vec2(dot(d, A.zw), dot(d, vec2(-A.w, A.z)));   // along, across
    vec2 fw = max(fwidth(l), vec2(0.004));
    float hl = B.x, hw = B.y;
    float edgeN = (nFine.b - 0.5) * 0.5;
    // ---- pista ----
    float rw = apBox(l, vec2(0.0), vec2(hl + 60.0, hw + edgeN), fw);          // incluye zonas de parada
    if (rw > 0.0) {
      float within = apBox(l, vec2(0.0), vec2(hl, hw), fw);
      vec3 asph = vec3(0.058, 0.058, 0.060) * (0.82 + 0.36 * nMacro.r) * (0.88 + 0.24 * nMicro.b);
      // parches y juntas longitudinales
      asph *= 1.0 - 0.10 * smoothstep(0.6, 0.75, nMacro.b);
      asph *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.06 + fw.y, abs(fract(l.y / 3.75 + 0.5) - 0.5) * 3.75));
      // caucho de neumáticos en las zonas de contacto
      float tz = max(smoothstep(hl - 80.0, hl - 250.0, abs(l.x)) * smoothstep(hl - 720.0, hl - 420.0, abs(l.x)), 0.0);
      float streak = texture(uNoiseTex, vec2(l.x / 160.0, l.y / 2.2)).r;
      asph *= 1.0 - 0.55 * tz * smoothstep(7.0, 2.0, abs(l.y)) * smoothstep(0.3, 0.7, streak);
      float mark = 0.0;
      // eje: trazos de 30 m cada 50 m
      float cl = clamp((0.45 - abs(l.y)) / fw.y + 0.5, 0.0, 1.0);
      float seg = abs(fract(l.x / 50.0) - 0.5) * 50.0;
      mark = max(mark, cl * clamp((15.0 - seg) / fw.x + 0.5, 0.0, 1.0) * step(abs(l.x), hl - 90.0));
      // bordes
      mark = max(mark, clamp((0.45 - abs(abs(l.y) - (hw - 1.2))) / fw.y + 0.5, 0.0, 1.0) * step(abs(l.x), hl));
      // cabeceras: la 0 se lee volando en +along; la 1 en -along
      if (l.x < 0.0) mark = max(mark, apEndMarks(l.x + hl, l.y, hw, uApNum[i].x, uApNum[i].y, B.w, fw));
      else mark = max(mark, apEndMarks(hl - l.x, -l.y, hw, uApNum[i].z, uApNum[i].w, B.w, fw));
      mark *= within;
      // zona de parada: galones amarillos
      float stop = (1.0 - within) * rw;
      float chev = abs(fract((abs(l.x) - hl + abs(l.y)) / 14.0) - 0.5) * 14.0;
      vec3 paint = vec3(0.62, 0.62, 0.60) * (0.75 + 0.35 * nMicro.r) * (0.8 + 0.2 * nMacro.g);
      vec3 c = mix(asph, paint, mark * (0.78 + 0.2 * nFine.r));
      c = mix(c, vec3(0.50, 0.38, 0.03), stop * clamp((0.5 - abs(chev - 3.5)) / max(fw.x, fw.y) + 0.5, 0.0, 1.0) * 0.8);
      res = vec4(c, rw);
      wetK = rw;
    }
    // ---- rodajes y plataforma ----
    for (int k = 0; k < ${MAX_RECTS}; k++) {
      int idx = i * ${MAX_RECTS} + k;
      float ty = uApRectT[idx];
      if (ty < 0.5) continue;
      vec4 Rc = uApRect[idx];
      float cov = apBox(l, Rc.xy, Rc.zw + edgeN * 0.5, fw);
      if (cov <= res.a) continue;
      vec3 c;
      if (ty > 2.5) {
        // plataforma de hormigón con juntas
        c = vec3(0.235, 0.230, 0.215) * (0.85 + 0.3 * nMacro.r) * (0.9 + 0.2 * nMicro.b);
        vec2 j = abs(fract(l / 6.0 + 0.5) - 0.5) * 6.0;
        float joint = 1.0 - min(clamp((j.x - 0.04) / fw.x, 0.0, 1.0), clamp((j.y - 0.04) / fw.y, 0.0, 1.0));
        c *= 1.0 - 0.45 * joint;
        c *= 1.0 - 0.35 * smoothstep(0.62, 0.8, nFine.r * 0.6 + nMacro.b * 0.5);   // manchas
        // línea de guía amarilla hacia el rodaje
        float gl = clamp((0.15 - abs(l.x - Rc.x)) / fw.x + 0.5, 0.0, 1.0) * step(abs(l.y - Rc.y), Rc.w);
        c = mix(c, vec3(0.55, 0.42, 0.03), gl * 0.85);
      } else {
        c = vec3(0.070, 0.070, 0.072) * (0.82 + 0.36 * nMacro.r) * (0.88 + 0.24 * nMicro.b);
        float t = ty < 1.5 ? l.y - Rc.y : l.x - Rc.x;
        float tf = ty < 1.5 ? fw.y : fw.x;
        c = mix(c, vec3(0.55, 0.42, 0.03), clamp((0.15 - abs(t)) / tf + 0.5, 0.0, 1.0) * 0.85);
      }
      res = vec4(mix(res.rgb, c, cov > 0.0 ? 1.0 : 0.0), max(res.a, cov));
    }
  }
  return res;
}
`;

// Sombras analíticas de los edificios (cajas alineadas con la pista) y foco de aterrizaje.
export const GLSL_AIRPORT_LIGHTING = /* glsl */`
uniform vec4 uApBox[${NAP * MAX_BOXES}];     // centro along, centro across, semilargo, semiancho
uniform float uApBoxH[${NAP * MAX_BOXES}];   // altura (0 = sin caja)
uniform vec4 uSpotPos;   // xyz: posición del foco relativa a la cámara, w: intensidad (0 = apagado)
uniform vec3 uSpotDir;
float buildingShadow(vec2 p, vec3 L) {
  if (L.y <= 0.02) return 1.0;
  float sh = 1.0;
  for (int i = 0; i < ${NAP}; i++) {
    vec4 A = uApA[i], B = uApB[i];
    vec2 d = p - A.xy;
    if (B.x <= 0.0 || abs(d.x) > B.x + 500.0 || abs(d.y) > B.x + 500.0) continue;
    vec3 o = vec3(dot(d, A.zw), dot(d, vec2(-A.w, A.z)), 0.0);
    vec3 r = vec3(dot(L.xz, A.zw), dot(L.xz, vec2(-A.w, A.z)), L.y);
    vec3 ir = 1.0 / (abs(r) + 1e-5) * sign(r + 1e-9);
    for (int k = 0; k < ${MAX_BOXES}; k++) {
      int idx = i * ${MAX_BOXES} + k;
      float h = uApBoxH[idx];
      if (h <= 0.0) continue;
      vec4 bx = uApBox[idx];
      vec3 bmin = vec3(bx.xy - bx.zw, -1.0), bmax = vec3(bx.xy + bx.zw, h);
      vec3 t0 = (bmin - o) * ir, t1 = (bmax - o) * ir;
      vec3 tn = min(t0, t1), tf = max(t0, t1);
      float tN = max(max(tn.x, tn.y), tn.z), tF = min(min(tf.x, tf.y), tf.z);
      if (tF > max(tN, 0.0)) sh = min(sh, 1.0 - smoothstep(0.0, 0.6, tF - max(tN, 0.0)));
    }
  }
  return sh;
}
// Iluminancia del faro de aterrizaje sobre un punto (relativo a cámara) con normal N.
vec3 landingLight(vec3 rel, vec3 N) {
  if (uSpotPos.w <= 0.0) return vec3(0.0);
  vec3 v = rel - uSpotPos.xyz;
  float d2 = max(dot(v, v), 1.0);
  vec3 l = v * inversesqrt(d2);
  float c = dot(l, uSpotDir);
  float cone = smoothstep(0.955, 0.992, c) + 0.06 * smoothstep(0.6, 0.95, c);
  return vec3(1.0, 0.96, 0.88) * (uSpotPos.w * cone * max(dot(N, -l), 0.0) / d2);
}
`;

// Atlas de dígitos (0-9) trazados con segmentos rectos, estilo numeración de pista.
export function createDigitTexture(gl) {
  const cw = 96, ch = 160;
  const c = document.createElement('canvas');
  c.width = cw * 10; c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#fff'; g.lineWidth = cw * 0.2; g.lineJoin = 'round'; g.lineCap = 'butt';
  const S = {
    0: [[0.2, 0.1], [0.8, 0.1], [0.8, 0.9], [0.2, 0.9], [0.2, 0.1], [0.5, 0.1]],
    1: [[0.3, 0.72], [0.55, 0.9], [0.55, 0.1]],
    2: [[0.2, 0.72], [0.2, 0.9], [0.8, 0.9], [0.8, 0.56], [0.2, 0.1], [0.8, 0.1]],
    3: [[0.2, 0.9], [0.8, 0.9], [0.45, 0.55], [0.8, 0.55], [0.8, 0.1], [0.2, 0.1]],
    4: [[0.66, 0.1], [0.66, 0.9], [0.18, 0.36], [0.86, 0.36]],
    5: [[0.8, 0.9], [0.2, 0.9], [0.2, 0.56], [0.8, 0.56], [0.8, 0.1], [0.2, 0.1]],
    6: [[0.78, 0.9], [0.2, 0.9], [0.2, 0.1], [0.8, 0.1], [0.8, 0.52], [0.2, 0.52]],
    7: [[0.2, 0.9], [0.8, 0.9], [0.42, 0.1]],
    8: [[0.2, 0.5], [0.2, 0.9], [0.8, 0.9], [0.8, 0.1], [0.2, 0.1], [0.2, 0.5], [0.8, 0.5]],
    9: [[0.8, 0.48], [0.2, 0.48], [0.2, 0.9], [0.8, 0.9], [0.8, 0.1], [0.22, 0.1]],
  };
  for (let d = 0; d < 10; d++) {
    g.beginPath();
    S[d].forEach(([x, y], i) => {
      const px = d * cw + x * cw, py = (1 - y) * ch;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    });
    g.stroke();
  }
  const img = g.getImageData(0, 0, c.width, c.height);
  const Wd = c.width;
  let src = new Float32Array(Wd * ch), tmp = new Float32Array(Wd * ch);
  for (let i = 0; i < Wd * ch; i++) src[i] = img.data[i * 4];
  // Borde suave (se umbraliza en el shader, pseudo-SDF): dos pasadas de desenfoque de caja
  // separable. Se hace a mano porque ctx.filter no existe en todos los navegadores.
  const R2 = 3;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < ch; y++) for (let x = 0; x < Wd; x++) {
      let s2 = 0, n = 0;
      for (let k = -R2; k <= R2; k++) { const xx = x + k; if (xx >= 0 && xx < Wd) { s2 += src[y * Wd + xx]; n++; } }
      tmp[y * Wd + x] = s2 / n;
    }
    for (let y = 0; y < ch; y++) for (let x = 0; x < Wd; x++) {
      let s2 = 0, n = 0;
      for (let k = -R2; k <= R2; k++) { const yy = y + k; if (yy >= 0 && yy < ch) { s2 += tmp[yy * Wd + x]; n++; } }
      src[y * Wd + x] = s2 / n;
    }
  }
  const data = new Uint8Array(Wd * ch);
  // voltear verticalmente: v = 0 es la base del dígito
  for (let y = 0; y < ch; y++) for (let x = 0; x < Wd; x++) data[(ch - 1 - y) * Wd + x] = Math.round(src[y * Wd + x]);
  const tex = createTexture(gl, { width: c.width, height: ch, format: 'r8', mips: true, wrap: 'clamp', aniso: 8 });
  updateTexture(gl, tex, data);
  return tex;
}

// Uniforms de los aeródromos para un programa que incluya GLSL_AIRPORT.
let _cache = null;
export function setAirportUniforms(prog, digitTex) {
  if (!_cache) {
    const A = new Float32Array(NAP * 4), B = new Float32Array(NAP * 4), Nn = new Float32Array(NAP * 4);
    const R = new Float32Array(NAP * MAX_RECTS * 4), T = new Float32Array(NAP * MAX_RECTS);
    AIRPORTS.slice(0, NAP).forEach((a, i) => {
      A.set([a.x, a.z, a.dir[0], a.dir[1]], i * 4);
      B.set([a.length / 2, a.width / 2, a.elev, a.main ? 1 : 0], i * 4);
      Nn.set([+a.numbers[0][0], +a.numbers[0][1], +a.numbers[1][0], +a.numbers[1][1]], i * 4);
      a.paved.slice(0, MAX_RECTS).forEach((r, k) => { R.set(r.slice(0, 4), (i * MAX_RECTS + k) * 4); T[i * MAX_RECTS + k] = r[4]; });
    });
    const BX = new Float32Array(NAP * MAX_BOXES * 4), BH = new Float32Array(NAP * MAX_BOXES);
    AIRPORTS.slice(0, NAP).forEach((a, i) => {
      airportBuildings(a).filter((b) => b.kind !== 'pole').slice(0, MAX_BOXES).forEach((b, k) => {
        BX.set([b.al, b.ac, b.ha, b.hc], (i * MAX_BOXES + k) * 4);
        BH[i * MAX_BOXES + k] = b.h + (b.kind === 'hangar' ? b.ha * 0.2 : b.kind === 'tower' ? 3.6 : 0);
      });
    });
    _cache = { A, B, Nn, R, T, BX, BH };
  }
  prog.set('uApA', _cache.A).set('uApB', _cache.B).set('uApNum', _cache.Nn).set('uApRect', _cache.R).set('uApRectT', _cache.T);
  prog.set('uApBox', _cache.BX).set('uApBoxH', _cache.BH);
  prog.set('uDigitTex', digitTex);
}
