// Fragmentos GLSL compartidos: hashing entero (PCG) y ruidos.
export const GLSL_HASH = /* glsl */`
#ifndef _HASH_
#define _HASH_
const float PI = 3.14159265358979;
const float TAU = 6.28318530717959;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  return v;
}
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
// p entero (ya con floor). Devuelve [0,1).
float hash21(vec2 p) { return float(pcg2d(uvec2(ivec2(p) + 65536)).x) * (1.0 / 4294967296.0); }
vec2 hash22(vec2 p) { return vec2(pcg2d(uvec2(ivec2(p) + 65536))) * (1.0 / 4294967296.0); }
vec3 hash33(vec3 p) { return vec3(pcg3d(uvec3(ivec3(p) + 65536))) * (1.0 / 4294967296.0); }
float hash31(vec3 p) { return float(pcg3d(uvec3(ivec3(p) + 65536)).x) * (1.0 / 4294967296.0); }
#endif
`;

export const GLSL_NOISE = /* glsl */`
#ifndef _NOISE_
#define _NOISE_
// Ruido de gradiente 2D con derivadas analíticas: (valor, d/dx, d/dy). Valor ~[-0.7, 0.7].
vec3 noised(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = hash22(i) * 2.0 - 1.0;
  vec2 gb = hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0;
  vec2 gc = hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0;
  vec2 gd = hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0;
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));
  float k = va - vb - vc + vd;
  return vec3(va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
              ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
              + du * (u.yx * k + vec2(vb, vc) - va));
}
float noise2(vec2 p) { return noised(p).x; }

// fBm estándar (valor ~[-1,1]).
float fbm(vec2 p, int oct) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < oct; i++) { s += a * noise2(p); p = m * p * 2.03 + 7.3; a *= 0.5; }
  return s * 1.4;
}
// fBm con derivadas.
vec3 fbmD(vec2 p, int oct) {
  float a = 0.5, f = 1.0;
  vec3 s = vec3(0.0);
  for (int i = 0; i < oct; i++) {
    vec3 n = noised(p * f + float(i) * 11.7);
    s += a * vec3(n.x, n.yz * f);
    a *= 0.5; f *= 2.0;
  }
  return s * 1.4;
}
// Ruido celular (Worley): (F1, F2).
vec2 worley(vec2 p) {
  vec2 i = floor(p), f = p - i;
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash22(i + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(vec2(d1, d2));
}
#endif
`;
