// Texturas de ruido repetibles (tileables) generadas en GPU para el detalle de materiales.
import { GLSL_HEADER, FULLSCREEN_VS, Program, createTexture, createFBO, bindFBO, drawFullscreen, genMips } from '../core/gl.js';
import { GLSL_HASH } from './glslNoise.js';

const GLSL_TILE_NOISE = /* glsl */`
vec2 hashP(vec2 i, float per) { return hash22(mod(i, per)); }
float pnoise(vec2 p, float per) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hashP(i, per) * 2.0 - 1.0, f);
  float b = dot(hashP(i + vec2(1.0, 0.0), per) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hashP(i + vec2(0.0, 1.0), per) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hashP(i + vec2(1.0, 1.0), per) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm(vec2 p, float per, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < oct; i++) { s += a * pnoise(p * per, per); per *= 2.0; a *= 0.5; }
  return s * 1.4;
}
vec2 pworley(vec2 p, float per) {
  p *= per;
  vec2 i = floor(p), f = p - i;
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + hashP(i + g, per) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(vec2(d1, d2));
}
// Campos de altura de detalle (0..1)
float hSoft(vec2 uv) { return pfbm(uv, 6.0, 6) * 0.5 + 0.5; }
// fBm 'ridged' repetible: aristas a varias escalas (roca fracturada).
float pridged(vec2 uv, float per, int oct) {
  float a = 0.5, s = 0.0, w = 1.0;
  for (int i = 0; i < oct; i++) {
    float n = 1.0 - abs(pnoise(uv * per + float(i) * 3.1, per) * 1.6);
    n = n * n * w;
    w = clamp(n * 1.8, 0.0, 1.0);
    s += a * n; per *= 2.0; a *= 0.5;
  }
  return s;
}
float hRock(vec2 uv) {
  // Estratos inclinados + fracturas
  vec2 q = uv + vec2(pfbm(uv, 4.0, 3), pfbm(uv + 0.31, 4.0, 3)) * 0.06;
  float r = pridged(q, 5.0, 6);
  float strata = 0.5 + 0.5 * sin((q.y * 2.0 + q.x * 1.0) * 6.2831853 * 6.0 + pfbm(uv, 6.0, 3) * 5.0);
  return clamp(r * 0.85 + strata * 0.12 + pfbm(uv + 0.7, 20.0, 3) * 0.12, 0.0, 1.0);
}
`;

const FS_NOISE = `${GLSL_HEADER}${GLSL_HASH}${GLSL_TILE_NOISE}
in vec2 vUV; out vec4 o;
void main() {
  float r = pfbm(vUV, 5.0, 6) * 0.5 + 0.5;                 // nubes suaves
  vec2 w = pworley(vUV, 14.0);
  float g = w.x;                                            // celular (F1)
  float b = pfbm(vUV + 0.5, 24.0, 4) * 0.5 + 0.5;           // grano fino
  float a = clamp(pridged(vUV + 0.21, 6.0, 5) * 1.25, 0.0, 1.0);   // aristas (ridged)
  o = vec4(r, g, b, a);
}`;

const FS_NORMAL = `${GLSL_HEADER}${GLSL_HASH}${GLSL_TILE_NOISE}
uniform float uRes;
in vec2 vUV; out vec4 o;
void main() {
  float e = 1.0 / uRes;
  float sx = hSoft(vUV + vec2(e, 0.0)) - hSoft(vUV - vec2(e, 0.0));
  float sy = hSoft(vUV + vec2(0.0, e)) - hSoft(vUV - vec2(0.0, e));
  float rx = hRock(vUV + vec2(e, 0.0)) - hRock(vUV - vec2(e, 0.0));
  float ry = hRock(vUV + vec2(0.0, e)) - hRock(vUV - vec2(0.0, e));
  // Pendientes escaladas a [-1,1] y guardadas como 0.5 + 0.5 * s
  vec2 s = clamp(vec2(sx, sy) * uRes * 0.045, -1.0, 1.0);
  vec2 r = clamp(vec2(rx, ry) * uRes * 0.03, -1.0, 1.0);
  o = vec4(s * 0.5 + 0.5, r * 0.5 + 0.5);
}`;

export function createDetailTextures(gl, res = 512) {
  const mk = (fs, name, uniforms = {}) => {
    const tex = createTexture(gl, { width: res, height: res, format: 'rgba8', mips: true, wrap: 'repeat', aniso: 8 });
    const fbo = createFBO(gl, [tex]);
    const prog = new Program(gl, FULLSCREEN_VS, fs, name);
    bindFBO(gl, fbo);
    prog.use().setAll(uniforms);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    drawFullscreen(gl);
    genMips(gl, tex);
    gl.deleteFramebuffer(fbo.fbo); gl.deleteProgram(prog.p);
    return tex;
  };
  const noise = mk(FS_NOISE, 'detailNoise');
  const normal = mk(FS_NORMAL, 'detailNormal', { uRes: res });
  bindFBO(gl, null);
  return { noise, normal };
}
