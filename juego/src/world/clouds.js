// Nubes volumétricas: capa de cúmulos por raymarching sobre ruido 3D Perlin-Worley
// (según Schneider, "The Real-time Volumetric Cloudscapes of Horizon Zero Dawn") con
// iluminación por marcha hacia la luz, aproximación de dispersión múltiple por octavas,
// acumulación temporal con reproyección, sombras proyectadas sobre el mundo y cirros.
import { GLSL_HEADER, FULLSCREEN_VS, Program, createTexture, createFBO, bindFBO, drawFullscreen, genMips } from '../core/gl.js';
import { GLSL_HASH } from './glslNoise.js';
import { GLSL_ATMO_SCENE } from './atmosphere.js';

const WEATHER_TILE = 61000; // metros que cubre el mapa meteorológico (se repite)
const SHADOW_HALF = 26000;  // semilado del mapa de sombras de nubes (m)

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------- generación de ruido ----------
const FS_SHAPE = `${GLSL_HEADER}${GLSL_HASH}
uniform float uZ;
in vec2 vUV; out vec4 o;
vec3 hp(vec3 i, float per) { return hash33(mod(i, per)); }
float gnoise(vec3 p, float per) {
  vec3 i = floor(p), f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float r = 0.0;
  float v[8];
  for (int k = 0; k < 8; k++) {
    vec3 c = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    v[k] = dot(hp(i + c, per) * 2.0 - 1.0, f - c);
  }
  return mix(mix(mix(v[0], v[1], u.x), mix(v[2], v[3], u.x), u.y), mix(mix(v[4], v[5], u.x), mix(v[6], v[7], u.x), u.y), u.z);
}
float pfbm(vec3 p, float per, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < oct; i++) { s += a * gnoise(p * per, per); per *= 2.0; a *= 0.5; }
  return s;
}
// Worley invertido (1 en el centro de la celda).
float worley(vec3 p, float per) {
  p *= per;
  vec3 i = floor(p), f = p - i;
  float d = 1.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 r = g + hp(i + g, per) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - sqrt(d);
}
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
void main() {
  vec3 p = vec3(vUV, uZ);
  float pf = pfbm(p, 4.0, 6) * 1.35 * 0.5 + 0.5;
  float w4 = worley(p, 4.0), w8 = worley(p, 8.0), w16 = worley(p, 16.0), w32 = worley(p, 32.0);
  float wf1 = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
  float wf2 = w8 * 0.625 + w16 * 0.25 + w32 * 0.125;
  float wf3 = w16 * 0.75 + w32 * 0.25;
  float pw = remap(pf, 0.0, 1.0, wf1, 1.0);                     // Perlin-Worley
  float lowF = wf1 * 0.625 + wf2 * 0.25 + wf3 * 0.125;
  float base = clamp(remap(pw, lowF - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  float detail = worley(p, 6.0) * 0.625 + worley(p, 12.0) * 0.25 + worley(p, 24.0) * 0.125;
  o = vec4(base, detail, pf, wf1);
}`;

const FS_WEATHER = `${GLSL_HEADER}${GLSL_HASH}
in vec2 vUV; out vec4 o;
vec2 hp(vec2 i, float per) { return hash22(mod(i, per)); }
float pnoise(vec2 p, float per) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hp(i, per) * 2.0 - 1.0, f);
  float b = dot(hp(i + vec2(1.0, 0.0), per) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hp(i + vec2(0.0, 1.0), per) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hp(i + vec2(1.0, 1.0), per) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm(vec2 p, float per, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < oct; i++) { s += a * pnoise(p * per, per); per *= 2.0; a *= 0.5; }
  return s * 1.4;
}
float pworley(vec2 p, float per) {
  p *= per;
  vec2 i = floor(p), f = p - i;
  float d = 2.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + hp(i + g, per) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - sqrt(d);
}
void main() {
  // R: campo de cobertura: estructuras de varias escalas (~20, 5 y 1.6 km) para que las nubes
  // formen grupos irregulares de tamaños distintos, con huecos celulares entre ellas.
  vec2 q = vUV + vec2(pfbm(vUV + 0.3, 6.0, 3), pfbm(vUV + 0.7, 6.0, 3)) * 0.03;
  float big = pfbm(vUV, 3.0, 4) * 0.5 + 0.5;
  float med = pfbm(q + 0.21, 11.0, 4) * 0.5 + 0.5;
  float sml = pfbm(q + 0.73, 37.0, 3) * 0.5 + 0.5;
  float cells = pworley(q, 29.0) * 0.65 + pworley(q + 0.37, 13.0) * 0.35;
  float r = big * 0.42 + med * 0.36 + sml * 0.16 + (cells - 0.5) * 0.30 + 0.03;
  r = smoothstep(0.16, 0.88, r);
  // G: tipo (0 = capa baja y plana, 1 = cúmulo de gran desarrollo).
  float g = clamp(pfbm(vUV + 0.5, 3.0, 4) * 0.9 + 0.5 + (cells - 0.5) * 0.35, 0.0, 1.0);
  // B: cirros (estrías).
  vec2 s = vec2(vUV.x * 1.0 + vUV.y * 0.35, vUV.y);
  float ci = pfbm(s * vec2(1.0, 4.0) + pfbm(vUV, 5.0, 3) * 0.2, 4.0, 5) * 0.5 + 0.5;
  ci = smoothstep(0.42, 0.85, ci) * (0.5 + 0.5 * big);
  o = vec4(r, g, ci, 1.0);
}`;

// ---------- densidad ----------
export const GLSL_CLOUD_DENSITY = /* glsl */`
uniform sampler3D uCloudShape;
uniform sampler2D uWeather;
uniform vec4 uCloudA;   // x: base (m), y: techo (m), z: cobertura 0..1, w: sigma (1/m)
uniform vec4 uCloudB;   // xy: desplazamiento por viento (m), z: evolución, w: sesgo de tipo
float cremap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
// xz: posición horizontal en el mundo; alt: altitud real (m). detail: aplicar erosión fina.
float cloudDensity(vec2 xz, float alt, float lod, bool detail) {
  float hf = (alt - uCloudA.x) / (uCloudA.y - uCloudA.x);
  if (hf <= 0.0 || hf >= 1.0) return 0.0;
  vec2 wxz = xz + uCloudB.xy;
  vec4 wt = textureLod(uWeather, wxz / ${WEATHER_TILE}.0, 0.0);
  float th = 1.0 - uCloudA.z;
  float cov = smoothstep(th - 0.06, th + 0.42, wt.r) * 0.9;
  if (cov <= 0.0) return 0.0;
  float type = clamp(wt.g + uCloudB.w, 0.0, 1.0);
  // Perfil vertical: base plana, desarrollo según el tipo y cima más estrecha que la base.
  float topH = mix(0.30, 1.0, type);
  float hn = hf / topH;
  float hg = smoothstep(0.0, 0.05, hf) * pow(clamp(1.0 - hn, 0.0, 1.0), 0.62);
  vec3 sp = vec3(wxz.x, alt * 1.1 + uCloudB.z * 300.0, wxz.y) / 4100.0;
  float shape = textureLod(uCloudShape, sp, lod).r;
  float d = clamp(cremap(shape * hg, 1.0 - cov, 1.0, 0.0, 1.0), 0.0, 1.0) * cov;
  if (d <= 0.0 || !detail) return d;
  vec3 dp = vec3(wxz.x, alt + uCloudB.z * 900.0, wxz.y) / 690.0;
  float dn = textureLod(uCloudShape, dp, lod).g;
  float md = mix(dn, 1.0 - dn, clamp(hf * 5.0, 0.0, 1.0));     // jirones abajo, bultos arriba
  d = clamp(cremap(d, md * 0.42, 1.0, 0.0, 1.0), 0.0, 1.0);
  return d;
}
`;

// Consulta de sombra de nubes para shaders de escena.
export const GLSL_CLOUD_SHADOW = /* glsl */`
uniform sampler2D uCloudShadowTex;
uniform vec4 uCloudShadowP;   // xy: centro (mundo xz), z: 1/(2·semilado), w: techo de nubes
uniform vec4 uCloudShadowL;   // xyz: dirección de la luz, w: base de nubes
float cloudShadow(vec3 wp) {
  vec2 g = wp.xz - uCloudShadowL.xz * (wp.y / max(uCloudShadowL.y, 0.07));
  vec2 uv = (g - uCloudShadowP.xy) * uCloudShadowP.z + 0.5;
  float s = texture(uCloudShadowTex, uv).r;
  vec2 e = abs(uv - 0.5) * 2.0;
  s = mix(s, 1.0, smoothstep(0.88, 1.0, max(e.x, e.y)));
  // Por encima de la capa no hay sombra.
  return mix(1.0, s, clamp((uCloudShadowP.w - wp.y) / max(uCloudShadowP.w - uCloudShadowL.w, 1.0), 0.0, 1.0));
}
`;

const FS_SHADOW = `${GLSL_HEADER}
${GLSL_CLOUD_DENSITY}
uniform vec4 uCenter;   // xy: centro, z: semilado
uniform vec3 uLightDir;
in vec2 vUV; out vec4 o;
void main() {
  vec2 g = uCenter.xy + (vUV - 0.5) * 2.0 * uCenter.z;
  float ly = max(uLightDir.y, 0.07);
  float tau = 0.0;
  const int N = 10;
  float thick = uCloudA.y - uCloudA.x;
  for (int i = 0; i < N; i++) {
    float alt = uCloudA.x + thick * (float(i) + 0.5) / float(N);
    vec2 xz = g + uLightDir.xz * (alt / ly);
    tau += cloudDensity(xz, alt, 1.5, false);
  }
  tau *= thick / float(N) / ly * uCloudA.w;
  // La dispersión múltiple hace la sombra menos opaca que la extinción directa.
  o = vec4(exp(-tau * 0.35) * 0.82 + 0.18 * exp(-tau * 0.04));
}`;

function marchFS(q) {
  return `${GLSL_HEADER}
#define STEPS ${q.steps}
#define LSTEPS ${q.lightSteps}
${GLSL_ATMO_SCENE}
${GLSL_CLOUD_DENSITY}
uniform sampler2D uDepth;
uniform vec3 uRay00, uRay10, uRay01, uRay11;
uniform vec3 uCamFwd;
uniform vec4 uProj;        // near, far, altitud de cámara, frame
uniform vec3 uCamXZT;      // xz de cámara en el mundo, tiempo
uniform vec3 uLightDir;    // luz principal (Sol o Luna)
uniform vec3 uLightE;      // su iluminancia (pre-expuesta)
uniform vec2 uHalfSize;
uniform float uCirrus;
in vec2 vUV;
layout(location = 0) out vec4 oCloud;   // rgb: radiancia dispersada, a: transmitancia
layout(location = 1) out vec4 oMeta;    // x: distancia media de la nube (m)

const float R = 6360000.0;
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// Raíces del rayo con la esfera de altitud a (cámara a altitud h). x: cercana, y: lejana; disc<0 -> (-1,-1)
vec2 shell(float h, float a, float dy) {
  float b = (R + h) * dy;
  float c = (h - a) * (2.0 * R + h + a);
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}
void main() {
  vec3 dir = normalize(mix(mix(uRay00, uRay10, vUV.x), mix(uRay01, uRay11, vUV.x), vUV.y));
  float h = uProj.z;
  // Profundidad de escena: el más lejano de los 2x2 texels.
  ivec2 fc = ivec2(gl_FragCoord.xy) * 2;
  ivec2 mx = textureSize(uDepth, 0) - 1;
  float d = max(max(texelFetch(uDepth, min(fc, mx), 0).r, texelFetch(uDepth, min(fc + ivec2(1, 0), mx), 0).r),
                max(texelFetch(uDepth, min(fc + ivec2(0, 1), mx), 0).r, texelFetch(uDepth, min(fc + ivec2(1, 1), mx), 0).r));
  float tScene = 1e9;
  if (d < 1.0) {
    float zv = 2.0 * uProj.x * uProj.y / (uProj.y + uProj.x - (2.0 * d - 1.0) * (uProj.y - uProj.x));
    tScene = zv / max(dot(dir, uCamFwd), 1e-3);
  } else {
    vec2 sea = shell(h, 0.0, dir.y);
    if (sea.x > 0.0) tScene = sea.x;
  }
  vec2 sb = shell(h, uCloudA.x, dir.y), st = shell(h, uCloudA.y, dir.y);
  float t0, t1;
  if (h < uCloudA.x) { t0 = sb.y; t1 = st.y; }
  else if (h <= uCloudA.y) { t0 = 0.0; t1 = (sb.x > 0.0) ? sb.x : st.y; }
  else {
    if (st.x <= 0.0) { t0 = 1e9; t1 = 0.0; }
    else { t0 = st.x; t1 = (sb.x > 0.0) ? sb.x : st.y; }
  }
  t1 = min(min(t1, tScene), 130000.0);

  vec3 scat = vec3(0.0);
  float T = 1.0, tSum = 0.0, wSum = 0.0;
  float cosL = dot(dir, uLightDir);
  if (t1 > t0) {
    // Crecimiento geométrico del paso para cubrir todo el segmento con STEPS muestras.
    float tk = max(t0, 1200.0);
    float k = max(exp(log(max(t1 / tk, 1.0001)) / float(STEPS)) - 1.0, 0.012);
    float dsMin = clamp((t1 - t0) / float(STEPS), 28.0, 140.0);
    float jit = ign(gl_FragCoord.xy + 5.588238 * mod(uProj.w, 64.0));
    float t = t0;
    float ds = max(dsMin, t * k);
    t += ds * jit;
    vec3 Eup = skyIrradiance(vec3(0.0, 1.0, 0.0));
    vec3 Edn = skyIrradiance(vec3(0.0, -1.0, 0.0));
    for (int i = 0; i < STEPS; i++) {
      if (t >= t1 || T < 0.006) break;
      ds = max(dsMin, t * k);
      vec3 p = dir * t;
      float alt = h + p.y + dot(p.xz, p.xz) / (2.0 * R);
      vec2 xz = uCamXZT.xy + p.xz;
      float lod = clamp(log2(t / 14000.0), 0.0, 2.5);
      float dens = cloudDensity(xz, alt, lod, t < 30000.0);
      if (dens > 0.001) {
        // Marcha hacia la luz
        float tau = 0.0, ls = 45.0, lt = 0.0;
        for (int j = 0; j < LSTEPS; j++) {
          lt += ls;
          vec3 lp = p + uLightDir * lt;
          float lalt = h + lp.y + dot(lp.xz, lp.xz) / (2.0 * R);
          tau += cloudDensity(uCamXZT.xy + lp.xz, lalt, lod + 1.0, false) * ls;
          ls *= 1.9;
        }
        tau *= uCloudA.w;
        // Dispersión múltiple aproximada por octavas (Wrenninge / Hillaire).
        float ms = 0.0, a = 1.0, b = 1.0, c = 1.0;
        for (int o2 = 0; o2 < 4; o2++) {
          float ph = mix(hg(cosL, 0.78 * c), hg(cosL, -0.22 * c), 0.28);
          ms += a * ph * exp(-tau * b);
          a *= 0.6; b *= 0.3; c *= 0.55;
        }
        ms *= 2.1;   // compensación de energía de los órdenes altos de dispersión
        float hf = clamp((alt - uCloudA.x) / (uCloudA.y - uCloudA.x), 0.0, 1.0);
        vec3 sunL = uLightE * lightTransmittance(alt, uLightDir.y);
        vec3 amb = (Eup * (0.25 + 0.75 * hf) + Edn * (1.0 - 0.6 * hf)) / (2.0 * PI);
        vec3 S = sunL * ms + amb * (0.35 + 0.65 * exp(-dens * 3.0));
        float sig = dens * uCloudA.w;
        float stepT = exp(-sig * ds);
        scat += T * S * (1.0 - stepT);
        float w = T * (1.0 - stepT);
        tSum += t * w; wSum += w;
        T *= stepT;
      }
      t += ds;
    }
  }
  // Cirros: capa fina muy alta, detrás de los cúmulos.
  vec3 cirrusScat = vec3(0.0);
  float cirrusT = 1.0;
  if (uCirrus > 0.0) {
    vec2 sc = shell(h, 9500.0, dir.y);
    float tc = h < 9500.0 ? sc.y : sc.x;
    if (tc > 0.0 && tc < tScene && tc < 400000.0) {
      vec3 p = dir * tc;
      vec2 xz = uCamXZT.xy + p.xz + uCloudB.xy * 2.5;
      float ci = textureLod(uWeather, xz / 143000.0, 0.0).b * (0.6 + 0.6 * textureLod(uWeather, xz / 37000.0 + 0.3, 0.0).b);
      vec3 ins, tr;
      aerialPerspective(vUV, min(tc, uAtmoCam.z), ins, tr);
      float haze = dot(tr, vec3(0.3333));
      float cosN = abs(dir.y) + 0.15;
      float alpha = clamp(ci * uCirrus * 0.40 / cosN, 0.0, 0.85) * haze * (1.0 - smoothstep(120000.0, 300000.0, tc));
      vec3 sunL = uLightE * lightTransmittance(9500.0, uLightDir.y);
      float ph = mix(hg(cosL, 0.7), hg(cosL, -0.1), 0.35);
      vec3 cl = sunL * ph * 2.6 + skyIrradiance(vec3(0.0, 1.0, 0.0)) / (2.0 * PI) * 0.7;
      cirrusScat = alpha * (cl * tr + ins);
      cirrusT = 1.0 - alpha;
    }
  }
  float tMean = wSum > 1e-5 ? tSum / wSum : max(t0, 2000.0);
  if (wSum > 1e-5) {
    vec3 ins, tr;
    aerialPerspective(vUV, min(tMean, uAtmoCam.z), ins, tr);
    // Perspectiva aérea a la distancia media; las nubes muy lejanas se disuelven en la calima.
    float fade = 1.0 - smoothstep(45000.0, 115000.0, tMean);
    scat = (scat * tr + ins * wSum) * fade;
    T = mix(1.0, T, fade);
  }
  scat += cirrusScat * T;
  T *= cirrusT;
  oCloud = vec4(scat, T);
  oMeta = vec4(min(tMean, 4.0e5), 0.0, 0.0, 1.0);
}`;
}

// Acumulación temporal con reproyección.
const FS_TEMPORAL = `${GLSL_HEADER}
uniform sampler2D uCur;
uniform sampler2D uMeta;
uniform sampler2D uHist;
uniform vec3 uRay00, uRay10, uRay01, uRay11;
uniform mat4 uPrevViewProj;
uniform vec3 uCamDelta;   // posición actual - anterior
uniform float uBlend;
in vec2 vUV; out vec4 o;
void main() {
  vec4 cur = textureLod(uCur, vUV, 0.0);
  float tm = textureLod(uMeta, vUV, 0.0).x;
  vec3 dir = normalize(mix(mix(uRay00, uRay10, vUV.x), mix(uRay01, uRay11, vUV.x), vUV.y));
  vec4 cp = uPrevViewProj * vec4(dir * tm + uCamDelta, 1.0);
  vec2 puv = cp.xy / cp.w * 0.5 + 0.5;
  float a = uBlend;
  if (cp.w <= 0.0 || puv.x < 0.0 || puv.x > 1.0 || puv.y < 0.0 || puv.y > 1.0) a = 1.0;
  vec4 hist = textureLod(uHist, puv, 0.0);
  // Limitar la historia al entorno del frame actual (evita estelas).
  vec4 mn = cur, mxv = cur;
  vec2 px = 1.0 / vec2(textureSize(uCur, 0));
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec4 s = textureLod(uCur, vUV + vec2(float(x), float(y)) * px, 0.0);
    mn = min(mn, s); mxv = max(mxv, s);
  }
  vec4 pad = (mxv - mn) * 0.75 + 0.02;
  hist = clamp(hist, mn - pad, mxv + pad);
  o = mix(hist, cur, a);
}`;

// Composición sobre la escena (se dibuja con mezcla: destino * alfa + rgb).
const FS_COMPOSITE = `${GLSL_HEADER}
uniform sampler2D uCloud;
uniform sampler2D uDepth;
uniform vec3 uRay00, uRay10, uRay01, uRay11;
uniform vec3 uCamFwd;
uniform vec4 uProj;     // near, far, altitud cámara, -
uniform vec2 uLayer;    // base, techo
in vec2 vUV; out vec4 o;
const float R = 6360000.0;
void main() {
  float d = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;
  vec4 c = textureLod(uCloud, vUV, 0.0);
  if (d < 1.0) {
    // Terreno más cerca que la entrada del rayo en la capa: sin nubes delante (borde exacto).
    vec3 dir = normalize(mix(mix(uRay00, uRay10, vUV.x), mix(uRay01, uRay11, vUV.x), vUV.y));
    float zv = 2.0 * uProj.x * uProj.y / (uProj.y + uProj.x - (2.0 * d - 1.0) * (uProj.y - uProj.x));
    float tScene = zv / max(dot(dir, uCamFwd), 1e-3);
    float h = uProj.z;
    float tEnter = 0.0;
    float b = (R + h) * dir.y;
    if (h < uLayer.x) {
      float cc = (h - uLayer.x) * (2.0 * R + h + uLayer.x);
      tEnter = -b + sqrt(max(b * b - cc, 0.0));
    } else if (h > uLayer.y) {
      float cc = (h - uLayer.y) * (2.0 * R + h + uLayer.y);
      float disc = b * b - cc;
      tEnter = disc > 0.0 ? -b - sqrt(disc) : 1e9;
      if (tEnter < 0.0) tEnter = 1e9;
    }
    float k = smoothstep(tEnter, tEnter + 400.0 + tEnter * 0.02, tScene);
    c = mix(vec4(0.0, 0.0, 0.0, 1.0), c, k);
  }
  o = c;
}`;

export class Clouds {
  constructor(gl, q) {
    this.gl = gl;
    this.q = { res: 96, steps: 64, lightSteps: 5, scale: 0.5, shadowRes: 512, ...q };
    this.enabled = true;
    this.frame = 0;
    this.wind = [0, 0];
    this.evolve = 0;
    this.prevViewProj = new Float32Array(16);
    this.prevCamPos = null;
    this.w = 0; this.h = 0;
    this.shadowCenter = [0, 0];
    this.params = { base: 1500, top: 3700, coverage: 0.42, sigma: 0.034, typeBias: 0.0, cirrus: 0.6 };
  }

  async init(onProgress = () => {}) {
    const gl = this.gl, N = this.q.res;
    this.shape = createTexture(gl, { width: N, height: N, depth: N, format: 'rgba8', mips: true, wrap: 'repeat' });
    const prog = new Program(gl, FULLSCREEN_VS, FS_SHAPE, 'cloudShape');
    const fbo = gl.createFramebuffer();
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    for (let z = 0; z < N; z++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.shape.tex, 0, z);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, N, N);
      prog.use().set('uZ', (z + 0.5) / N);
      drawFullscreen(gl);
      if (z % 6 === 5) { gl.flush(); onProgress((z + 1) / N); await nextFrame(); }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteProgram(prog.p);
    genMips(gl, this.shape);

    this.weather = createTexture(gl, { width: 512, height: 512, format: 'rgba8', mips: false, wrap: 'repeat' });
    const pw = new Program(gl, FULLSCREEN_VS, FS_WEATHER, 'cloudWeather');
    const fw = createFBO(gl, [this.weather]);
    bindFBO(gl, fw);
    pw.use();
    drawFullscreen(gl);
    gl.deleteFramebuffer(fw.fbo); gl.deleteProgram(pw.p);

    this.shadowTex = createTexture(gl, { width: this.q.shadowRes, height: this.q.shadowRes, format: 'r8', filter: 'linear', wrap: 'clamp' });
    this.shadowFBO = createFBO(gl, [this.shadowTex]);
    this.pShadow = new Program(gl, FULLSCREEN_VS, FS_SHADOW, 'cloudShadow');
    this.pMarch = new Program(gl, FULLSCREEN_VS, marchFS(this.q), 'cloudMarch');
    this.pTemporal = new Program(gl, FULLSCREEN_VS, FS_TEMPORAL, 'cloudTemporal');
    this.pComposite = new Program(gl, FULLSCREEN_VS, FS_COMPOSITE, 'cloudComposite');
    // Textura blanca para cuando las nubes están desactivadas.
    this.whiteTex = createTexture(gl, { width: 1, height: 1, format: 'r8', data: new Uint8Array([255]) });
    bindFBO(gl, null);
  }

  resize(sceneW, sceneH) {
    const gl = this.gl;
    const w = Math.max(8, Math.ceil(sceneW * this.q.scale)), h = Math.max(8, Math.ceil(sceneH * this.q.scale));
    if (w === this.w && h === this.h) return;
    for (const t of [this.cur, this.meta, this.histA, this.histB]) if (t) gl.deleteTexture(t.tex);
    for (const f of [this.fMarch, this.fA, this.fB]) if (f) gl.deleteFramebuffer(f.fbo);
    this.w = w; this.h = h;
    const mk = () => createTexture(gl, { width: w, height: h, format: 'rgba16f', filter: 'linear' });
    this.cur = mk(); this.meta = mk(); this.histA = mk(); this.histB = mk();
    this.fMarch = createFBO(gl, [this.cur, this.meta]);
    this.fA = createFBO(gl, [this.histA]);
    this.fB = createFBO(gl, [this.histB]);
    this.histValid = false;
  }

  setDensityUniforms(p) {
    const c = this.params;
    p.set('uCloudShape', this.shape).set('uWeather', this.weather);
    // La cobertura de usuario (0..1) se reescala al umbral interno del campo meteorológico.
    const cov = this.enabled && c.coverage > 0.01 ? 0.34 + 0.66 * Math.min(c.coverage, 1) : 0;
    p.set('uCloudA', c.base, c.top, cov, c.sigma);
    p.set('uCloudB', this.wind[0], this.wind[1], this.evolve, c.typeBias);
  }

  // Uniforms de sombra de nubes para shaders de escena.
  bindShadow(p, lightDir) {
    const c = this.params;
    p.set('uCloudShadowTex', this.enabled ? this.shadowTex : this.whiteTex);
    p.set('uCloudShadowP', this.shadowCenter[0], this.shadowCenter[1], 1 / (2 * SHADOW_HALF), c.top);
    p.set('uCloudShadowL', lightDir[0], lightDir[1], lightDir[2], c.base);
  }

  // Avanza el viento y rehornea el mapa de sombras. Llamar antes de dibujar la escena.
  update(ctx) {
    const { env, cam, dt } = ctx;
    const gl = this.gl;
    Object.assign(this.params, { base: env.clouds.base, top: env.clouds.top, coverage: env.clouds.coverage });
    if (env.clouds.cirrus !== undefined) this.params.cirrus = env.clouds.cirrus;
    // El mapa meteorológico se desplaza en sentido contrario al movimiento de las nubes.
    const to = ((env.wind.dir + 180) * Math.PI) / 180;
    const sp = env.wind.speed * 1.6 + 2.0; // el viento en altura es mayor
    this.wind[0] -= Math.sin(to) * sp * dt;
    this.wind[1] -= -Math.cos(to) * sp * dt;
    this.evolve += dt * 0.012;
    if (!this.enabled) return;
    const light = env.primaryLight;
    const texel = (2 * SHADOW_HALF) / this.q.shadowRes;
    const ly = Math.max(light[1], 0.07);
    // Centrado bajo la cámara (en coordenadas proyectadas al suelo), ajustado a la rejilla.
    const gx = cam.pos[0] - light[0] * (cam.pos[1] / ly) * 0.0, gz = cam.pos[2] - light[2] * (cam.pos[1] / ly) * 0.0;
    this.shadowCenter = [Math.round(gx / texel) * texel, Math.round(gz / texel) * texel];
    bindFBO(gl, this.shadowFBO);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    const p = this.pShadow.use();
    this.setDensityUniforms(p);
    p.set('uCenter', this.shadowCenter[0], this.shadowCenter[1], SHADOW_HALF, 0).set('uLightDir', light);
    drawFullscreen(gl);
  }

  // Marcha + acumulación temporal + composición sobre el color de escena.
  render(ctx, sceneColorFBO, sceneDepth) {
    if (!this.enabled) return;
    const { cam, env, atmosphere, exposure } = ctx;
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    const light = env.primaryLight;
    const isSun = light === env.sunDir;
    const E = (isSun ? env.sunE0 : env.moonE0).map((v) => v * exposure);
    // 1. marcha
    bindFBO(gl, this.fMarch);
    let p = this.pMarch.use();
    atmosphere.bind(p, [this.w, this.h]);
    this.setDensityUniforms(p);
    p.set('uDepth', sceneDepth);
    p.set('uRay00', cam.rays[0]).set('uRay10', cam.rays[1]).set('uRay01', cam.rays[2]).set('uRay11', cam.rays[3]);
    p.set('uCamFwd', cam.fwd).set('uProj', cam.near, cam.far, Math.max(cam.pos[1], 2), this.frame);
    p.set('uCamXZT', cam.pos[0], cam.pos[2], env.time).set('uLightDir', light).set('uLightE', E);
    p.set('uHalfSize', this.w, this.h).set('uCirrus', this.params.cirrus);
    drawFullscreen(gl);
    // 2. temporal
    const dst = this.frame % 2 === 0 ? this.fA : this.fB;
    const hist = this.frame % 2 === 0 ? this.histB : this.histA;
    const out = this.frame % 2 === 0 ? this.histA : this.histB;
    bindFBO(gl, dst);
    p = this.pTemporal.use();
    const pc = this.prevCamPos || cam.pos;
    p.set('uCur', this.cur).set('uMeta', this.meta).set('uHist', hist);
    p.set('uRay00', cam.rays[0]).set('uRay10', cam.rays[1]).set('uRay01', cam.rays[2]).set('uRay11', cam.rays[3]);
    p.set('uPrevViewProj', this.prevViewProj).set('uCamDelta', cam.pos[0] - pc[0], cam.pos[1] - pc[1], cam.pos[2] - pc[2]);
    p.set('uBlend', this.histValid ? this.blend ?? 0.14 : 1.0);
    drawFullscreen(gl);
    this.histValid = true;
    this.prevViewProj.set(cam.viewProj);
    this.prevCamPos = [cam.pos[0], cam.pos[1], cam.pos[2]];
    // 3. composición
    bindFBO(gl, sceneColorFBO);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
    p = this.pComposite.use();
    p.set('uCloud', out).set('uDepth', sceneDepth);
    p.set('uRay00', cam.rays[0]).set('uRay10', cam.rays[1]).set('uRay01', cam.rays[2]).set('uRay11', cam.rays[3]);
    p.set('uCamFwd', cam.fwd).set('uProj', cam.near, cam.far, Math.max(cam.pos[1], 2), 0).set('uLayer', this.params.base, this.params.top);
    drawFullscreen(gl);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    this.frame++;
  }
}
