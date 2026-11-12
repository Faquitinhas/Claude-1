// Atmósfera física en tiempo real (basada en Hillaire 2020, "A Scalable and Production Ready
// Sky and Atmosphere Rendering Technique"): dispersión Rayleigh + Mie + ozono con LUTs de
// transmitancia, dispersión múltiple, vista del cielo y perspectiva aérea (atlas de froxels).
// Dos luces: Sol y Luna. Toda la radiancia se guarda ya multiplicada por la exposición.
import { GLSL_HEADER, FULLSCREEN_VS, Program, createTexture, createFBO, bindFBO, drawFullscreen } from '../core/gl.js';

export const AP_RES = 32, AP_SLICES = 32, AP_COLS = 8, AP_ROWS = 4;
export const AP_MAX_KM = 200;
export const EARTH_RADIUS = 6360000; // m
const SKY_W = 256, SKY_H = 128;
const IRR_RES = 16;

// Constantes y funciones del medio (unidades: km).
export const GLSL_ATMO_CORE = /* glsl */`
const float RG = 6360.0;
const float RT = 6460.0;
const vec3 BETA_R = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float BETA_MS = 3.996e-3;
const vec3 BETA_O = vec3(0.650e-3, 1.881e-3, 0.085e-3);
#ifndef PI
#define PI 3.14159265358979
#endif
uniform vec4 uAtmo; // x: escala Mie (calima), y: g de Mie, z: escala ozono, w: albedo del suelo

float rayleighPhase(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float miePhaseG(float c, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
// Distancia positiva más cercana a la esfera de radio R centrada en el origen; -1 si no hay.
float raySphere(vec3 p, vec3 d, float R) {
  float b = dot(p, d), c = dot(p, p) - R * R, disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float s = sqrt(disc);
  float t0 = -b - s, t1 = -b + s;
  if (t0 > 0.0) return t0;
  if (t1 > 0.0) return t1;
  return -1.0;
}
void medium(float r, out vec3 sR, out float sM, out vec3 ext) {
  float h = max(r - RG, 0.0);
  sR = BETA_R * exp(-h / 8.0);
  sM = BETA_MS * uAtmo.x * exp(-h / 1.2);
  vec3 oz = BETA_O * uAtmo.z * max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  ext = sR + sM * 1.11 + oz;
}
vec2 transUV(float r, float mu) {
  return vec2(0.5 + 0.5 * mu, sqrt(clamp((r - RG) / (RT - RG), 0.0, 1.0)));
}
`;

const FS_TRANS = `${GLSL_HEADER}${GLSL_ATMO_CORE}
in vec2 vUV; out vec4 o;
void main() {
  float mu = vUV.x * 2.0 - 1.0;
  float r = RG + vUV.y * vUV.y * (RT - RG);
  vec3 pos = vec3(0.0, r, 0.0);
  vec3 dir = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  if (raySphere(pos, dir, RG) > 0.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float tT = raySphere(pos, dir, RT);
  vec3 tau = vec3(0.0);
  const int N = 40;
  float dt = tT / float(N);
  for (int i = 0; i < N; i++) {
    vec3 p = pos + dir * ((float(i) + 0.5) * dt);
    vec3 sR, ext; float sM;
    medium(length(p), sR, sM, ext);
    tau += ext * dt;
  }
  o = vec4(exp(-tau), 1.0);
}`;

const FS_MS = `${GLSL_HEADER}${GLSL_ATMO_CORE}
uniform sampler2D uTransLUT;
in vec2 vUV; out vec4 o;
void main() {
  float sunCos = vUV.x * 2.0 - 1.0;
  float r = RG + clamp(vUV.y, 0.0, 1.0) * (RT - RG - 0.001) + 0.0005;
  vec3 pos = vec3(0.0, r, 0.0);
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - sunCos * sunCos)), sunCos, 0.0);
  vec3 lumTotal = vec3(0.0), fms = vec3(0.0);
  const int SQ = 8;
  const int STEPS = 20;
  for (int i = 0; i < SQ; i++) for (int j = 0; j < SQ; j++) {
    float th = PI * (float(i) + 0.5) / float(SQ);
    float ph = acos(clamp(1.0 - 2.0 * (float(j) + 0.5) / float(SQ), -1.0, 1.0));
    vec3 dir = vec3(sin(ph) * cos(th * 2.0), cos(ph), sin(ph) * sin(th * 2.0));
    float tG = raySphere(pos, dir, RG), tT = raySphere(pos, dir, RT);
    float tMax = tG > 0.0 ? tG : tT;
    float cosT = dot(dir, sun);
    float pR = rayleighPhase(cosT), pM = miePhaseG(cosT, uAtmo.y);
    vec3 lum = vec3(0.0), lumF = vec3(0.0), T = vec3(1.0);
    float dt = tMax / float(STEPS);
    for (int s = 0; s < STEPS; s++) {
      vec3 p = pos + dir * ((float(s) + 0.5) * dt);
      float pr = length(p);
      vec3 sR, ext; float sM;
      medium(pr, sR, sM, ext);
      vec3 sT = exp(-ext * dt);
      vec3 sNoPhase = sR + sM;
      lumF += T * (sNoPhase - sNoPhase * sT) / ext;
      vec3 sunT = texture(uTransLUT, transUV(pr, dot(p, sun) / pr)).rgb;
      vec3 inS = (sR * pR + sM * pM) * sunT;
      lum += T * (inS - inS * sT) / ext;
      T *= sT;
    }
    if (tG > 0.0) {
      vec3 hit = pos + dir * tG;
      float nl = dot(normalize(hit), sun);
      if (nl > 0.0) lum += T * uAtmo.w / PI * texture(uTransLUT, transUV(RG, nl)).rgb * nl;
    }
    lumTotal += lum; fms += lumF;
  }
  float inv = 1.0 / float(SQ * SQ);
  vec3 psi = (lumTotal * inv) / (1.0 - fms * inv);
  o = vec4(psi, 1.0);
}`;

// Integración de la dispersión a lo largo de un rayo para dos luces.
const GLSL_MARCH = /* glsl */`
uniform sampler2D uTransLUT;
uniform sampler2D uMSLUT;
uniform vec3 uSunE;   // iluminancia solar (pre-expuesta)
uniform vec3 uMoonE;
vec3 msLookup(float r, float mu) {
  return texture(uMSLUT, vec2(0.5 + 0.5 * mu, clamp((r - RG) / (RT - RG), 0.0, 1.0))).rgb;
}
// Devuelve radiancia in-scattered: base (Rayleigh + múltiple + todo lo lunar) y Mie solar sin fase.
void marchScatter(vec3 pos, vec3 dir, vec3 sun, vec3 moon, float tMax, int steps,
                  out vec3 Lbase, out vec3 LmieSun, out vec3 Tout) {
  float cS = dot(dir, sun), cM = dot(dir, moon);
  float pRs = rayleighPhase(cS), pRm = rayleighPhase(cM), pMm = miePhaseG(cM, uAtmo.y);
  Lbase = vec3(0.0); LmieSun = vec3(0.0);
  vec3 T = vec3(1.0);
  float dt = tMax / float(steps);
  for (int i = 0; i < steps; i++) {
    vec3 p = pos + dir * ((float(i) + 0.4) * dt);
    float pr = length(p);
    vec3 sR, ext; float sM;
    medium(pr, sR, sM, ext);
    vec3 sT = exp(-ext * dt);
    float muS = dot(p, sun) / pr, muM = dot(p, moon) / pr;
    vec3 tS = texture(uTransLUT, transUV(pr, muS)).rgb * uSunE;
    vec3 tM = texture(uTransLUT, transUV(pr, muM)).rgb * uMoonE;
    vec3 ms = msLookup(pr, muS) * uSunE + msLookup(pr, muM) * uMoonE;
    vec3 base = sR * (pRs * tS + pRm * tM) + sM * pMm * tM + (sR + sM) * ms;
    vec3 mie = sM * tS;
    vec3 k = (1.0 - sT) / ext;
    Lbase += T * base * k;
    LmieSun += T * mie * k;
    T *= sT;
  }
  Tout = T;
}
`;

const FS_SKY = `${GLSL_HEADER}${GLSL_ATMO_CORE}${GLSL_MARCH}
uniform float uCamR;
uniform vec3 uSunDir, uMoonDir;
in vec2 vUV;
layout(location = 0) out vec4 oBase;
layout(location = 1) out vec4 oMie;
void main() {
  float phi = (vUV.x - 0.5) * 2.0 * PI;
  float dip = acos(clamp(sqrt(max(uCamR * uCamR - RG * RG, 0.0)) / uCamR, 0.0, 1.0));
  float thH = 0.5 * PI + dip;
  float th;
  if (vUV.y >= 0.5) { float c = 2.0 * vUV.y - 1.0; th = thH - c * c * thH; }
  else { float c = 1.0 - 2.0 * vUV.y; th = thH + c * c * (PI - thH); }
  // phi = acimut absoluto: 0 -> +X, sentido hacia +Z
  vec3 dir = vec3(sin(th) * cos(phi), cos(th), sin(th) * sin(phi));
  vec3 pos = vec3(0.0, uCamR, 0.0);
  float tG = raySphere(pos, dir, RG), tT = raySphere(pos, dir, RT);
  float tMax = tG > 0.0 ? tG : tT;
  vec3 Lb, Lm, T;
  marchScatter(pos, dir, uSunDir, uMoonDir, tMax, 36, Lb, Lm, T);
  oBase = vec4(Lb, dot(T, vec3(0.3333)));
  oMie = vec4(Lm, 1.0);
}`;

const FS_AP = `${GLSL_HEADER}${GLSL_ATMO_CORE}${GLSL_MARCH}
uniform float uCamR;
uniform vec3 uSunDir, uMoonDir;
uniform vec3 uRay00, uRay10, uRay01, uRay11;
uniform float uAPMax;
layout(location = 0) out vec4 oScat;
layout(location = 1) out vec4 oTrans;
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 tile = floor(fc / ${AP_RES}.0);
  float slice = tile.y * ${AP_COLS}.0 + tile.x;
  vec2 suv = (fc - tile * ${AP_RES}.0) / ${AP_RES}.0;
  vec3 dir = normalize(mix(mix(uRay00, uRay10, suv.x), mix(uRay01, uRay11, suv.x), suv.y));
  float w = (slice + 0.5) / ${AP_SLICES}.0;
  float t = uAPMax * w * w;
  vec3 pos = vec3(0.0, uCamR, 0.0);
  float tG = raySphere(pos, dir, RG);
  if (tG > 0.0) t = min(t, tG);
  vec3 Lb, Lm, T;
  int steps = 10 + int(slice) / 2;
  marchScatter(pos, dir, uSunDir, uMoonDir, t, steps, Lb, Lm, T);
  float pM = miePhaseG(dot(dir, uSunDir), uAtmo.y);
  oScat = vec4(Lb + Lm * pM, 1.0);
  oTrans = vec4(T, 1.0);
}`;

// Funciones de consulta para los shaders de escena.
export const GLSL_ATMO_SCENE = /* glsl */`
#ifndef PI
#define PI 3.14159265358979
#endif
uniform sampler2D uTransLUT;
uniform sampler2D uSkyBase;
uniform sampler2D uSkyMie;
uniform sampler2D uAPScat;
uniform sampler2D uAPTrans;
uniform sampler2D uIrrMap;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunE;       // iluminancia solar fuera de la atmósfera (pre-expuesta)
uniform vec3 uMoonE;
uniform vec4 uAtmoCam;    // x: altitud cámara (km), y: depresión del horizonte (rad), z: alcance AP (m), w: g de Mie
uniform vec2 uViewport;   // tamaño del framebuffer de escena

float miePhaseS(float c) {
  float g = uAtmoCam.w, g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
// Transmitancia hacia una luz desde un punto a 'altM' metros sobre el mar.
vec3 lightTransmittance(float altM, float lightY) {
  return textureLod(uTransLUT, vec2(0.5 + 0.5 * lightY, sqrt(clamp(altM * 1e-5, 0.0, 1.0))), 0.0).rgb;
}
vec2 skyUV(vec3 dir) {
  float thH = 0.5 * PI + uAtmoCam.y;
  float th = acos(clamp(dir.y, -1.0, 1.0));
  float v;
  if (th <= thH) v = max(0.5 + 0.5 * sqrt(clamp((thH - th) / thH, 0.0, 1.0)), 0.5 + 0.5 / ${SKY_H}.0);
  else v = min(0.5 - 0.5 * sqrt(clamp((th - thH) / (PI - thH), 0.0, 1.0)), 0.5 - 0.5 / ${SKY_H}.0);
  float phi = atan(dir.z, dir.x + 1e-9);
  return vec2(phi / (2.0 * PI) + 0.5, v);
}
// Radiancia del cielo (o de la atmósfera hasta el suelo) en una dirección.
vec3 skyRadiance(vec3 dir) {
  vec2 uv = skyUV(dir);
  return textureLod(uSkyBase, uv, 0.0).rgb + textureLod(uSkyMie, uv, 0.0).rgb * miePhaseS(dot(dir, uSunDir));
}
// Versión suavizada (para reflejos rugosos / irradiancia): limita el pico de Mie.
vec3 skyRadianceSoft(vec3 dir) {
  vec2 uv = skyUV(dir);
  return textureLod(uSkyBase, uv, 0.0).rgb + textureLod(uSkyMie, uv, 0.0).rgb * miePhaseS(min(dot(dir, uSunDir), 0.9));
}
// Transmitancia media de la atmósfera a lo largo de todo el rayo de vista (hasta el suelo o el espacio).
float skyTransmittance(vec3 dir) { return textureLod(uSkyBase, skyUV(dir), 0.0).a; }

vec4 apSample(sampler2D tex, vec2 suv, float s) {
  float s0 = floor(s), f = s - s0;
  float s1 = min(s0 + 1.0, ${AP_SLICES - 1}.0);
  vec2 t = clamp(suv, 0.5 / ${AP_RES}.0, 1.0 - 0.5 / ${AP_RES}.0);
  vec2 uv0 = (vec2(mod(s0, ${AP_COLS}.0), floor(s0 / ${AP_COLS}.0)) + t) / vec2(${AP_COLS}.0, ${AP_ROWS}.0);
  vec2 uv1 = (vec2(mod(s1, ${AP_COLS}.0), floor(s1 / ${AP_COLS}.0)) + t) / vec2(${AP_COLS}.0, ${AP_ROWS}.0);
  return mix(textureLod(tex, uv0, 0.0), textureLod(tex, uv1, 0.0), f);
}
// Perspectiva aérea para un punto a 'dist' metros de la cámara en el píxel suv (0..1).
void aerialPerspective(vec2 suv, float dist, out vec3 inscat, out vec3 trans) {
  float w = sqrt(clamp(dist / uAtmoCam.z, 0.0, 1.0));
  float s = w * ${AP_SLICES}.0 - 0.5;
  float nearK = clamp(s + 0.5, 0.0, 1.0);
  s = clamp(s, 0.0, ${AP_SLICES - 1}.0);
  inscat = apSample(uAPScat, suv, s).rgb * nearK;
  trans = mix(vec3(1.0), apSample(uAPTrans, suv, s).rgb, nearK);
}
#ifndef VERTEX_STAGE
vec3 applyAP(vec3 color, vec3 relPos) {
  vec3 ins, tr;
  aerialPerspective(gl_FragCoord.xy / uViewport, length(relPos), ins, tr);
  return color * tr + ins;
}
#endif
vec2 octEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 p = n.xz;
  if (n.y < 0.0) p = (1.0 - abs(p.yx)) * vec2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
  return p * 0.5 + 0.5;
}
vec3 octDecode(vec2 uv) {
  vec2 f = uv * 2.0 - 1.0;
  vec3 n = vec3(f.x, 1.0 - abs(f.x) - abs(f.y), f.y);
  float t = clamp(-n.y, 0.0, 1.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.z += n.z >= 0.0 ? -t : t;
  return normalize(n);
}
// Irradiancia difusa del cielo + rebote del suelo para una normal.
vec3 skyIrradiance(vec3 n) {
  vec2 uv = clamp(octEncode(n), 0.5 / ${IRR_RES}.0, 1.0 - 0.5 / ${IRR_RES}.0);
  return textureLod(uIrrMap, uv, 0.0).rgb;
}
`;

const FS_IRR = `${GLSL_HEADER}
${GLSL_ATMO_SCENE}
uniform vec3 uGroundAlbedo;
in vec2 vUV; out vec4 o;
void main() {
  vec3 n = octDecode(vUV);
  vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, n)), ty = cross(n, tx);
  // Radiancia aproximada del suelo (difuso): sol + cielo cenital.
  vec3 zen = skyRadianceSoft(vec3(0.0, 1.0, 0.0));
  vec3 gnd = uGroundAlbedo * (uSunE * lightTransmittance(0.0, uSunDir.y) * max(uSunDir.y, 0.0) / PI
           + uMoonE * lightTransmittance(0.0, uMoonDir.y) * max(uMoonDir.y, 0.0) / PI + zen);
  vec3 sum = vec3(0.0);
  const int SQ = 8;
  for (int i = 0; i < SQ; i++) for (int j = 0; j < SQ; j++) {
    float u1 = (float(i) + 0.5) / float(SQ), u2 = (float(j) + 0.5) / float(SQ);
    float r = sqrt(u1), ph = 2.0 * PI * u2;
    vec3 d = tx * (r * cos(ph)) + ty * (r * sin(ph)) + n * sqrt(1.0 - u1);
    float horizon = -sin(uAtmoCam.y);
    vec3 L = d.y > horizon ? skyRadianceSoft(d) : gnd * skyTransmittance(d) + skyRadianceSoft(d);
    sum += L;
  }
  o = vec4(sum * (PI / float(SQ * SQ)), 1.0);
}`;

export class Atmosphere {
  constructor(gl) {
    this.gl = gl;
    const f16 = 'rgba16f';
    this.params = { mie: 3.0, g: 0.8, ozone: 1.0, albedo: 0.15 };
    this.dirty = true;
    this.transLUT = createTexture(gl, { width: 256, height: 64, format: f16 });
    this.msLUT = createTexture(gl, { width: 32, height: 32, format: f16 });
    this.skyBase = createTexture(gl, { width: SKY_W, height: SKY_H, format: f16, wrapS: 'repeat', wrapT: 'clamp' });
    this.skyMie = createTexture(gl, { width: SKY_W, height: SKY_H, format: f16, wrapS: 'repeat', wrapT: 'clamp' });
    this.apScat = createTexture(gl, { width: AP_RES * AP_COLS, height: AP_RES * AP_ROWS, format: f16 });
    this.apTrans = createTexture(gl, { width: AP_RES * AP_COLS, height: AP_RES * AP_ROWS, format: f16 });
    this.irrMap = createTexture(gl, { width: IRR_RES, height: IRR_RES, format: f16 });
    this.fTrans = createFBO(gl, [this.transLUT]);
    this.fMS = createFBO(gl, [this.msLUT]);
    this.fSky = createFBO(gl, [this.skyBase, this.skyMie]);
    this.fAP = createFBO(gl, [this.apScat, this.apTrans]);
    this.fIrr = createFBO(gl, [this.irrMap]);
    if (!this.fTrans.ok || !this.fSky.ok) throw new Error('Tu dispositivo no admite texturas flotantes como destino de render (necesario para la atmósfera).');
    this.pTrans = new Program(gl, FULLSCREEN_VS, FS_TRANS, 'atmoTrans');
    this.pMS = new Program(gl, FULLSCREEN_VS, FS_MS, 'atmoMS');
    this.pSky = new Program(gl, FULLSCREEN_VS, FS_SKY, 'atmoSky');
    this.pAP = new Program(gl, FULLSCREEN_VS, FS_AP, 'atmoAP');
    this.pIrr = new Program(gl, FULLSCREEN_VS, FS_IRR, 'atmoIrr');
    this.state = { camAltKm: 0.01, dip: 0, sunDir: [0, 1, 0], moonDir: [0, -1, 0], sunE: [1, 1, 1], moonE: [0, 0, 0] };
  }

  setParams(p) { Object.assign(this.params, p); this.dirty = true; }

  _atmoU(prog) {
    const p = this.params;
    prog.set('uAtmo', p.mie, p.g, p.ozone, p.albedo);
  }

  // camAlt en metros; sunE/moonE ya multiplicadas por la exposición; rays = 4 direcciones de esquina (mundo).
  update(camAlt, sunDir, moonDir, sunE, moonE, rays) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    if (this.dirty) {
      bindFBO(gl, this.fTrans);
      this.pTrans.use(); this._atmoU(this.pTrans);
      drawFullscreen(gl);
      bindFBO(gl, this.fMS);
      this.pMS.use(); this._atmoU(this.pMS); this.pMS.set('uTransLUT', this.transLUT);
      drawFullscreen(gl);
      this.dirty = false;
    }
    const camR = 6360 + Math.max(camAlt, 2) / 1000;
    const dip = Math.acos(Math.min(1, Math.sqrt(Math.max(camR * camR - 6360 * 6360, 0)) / camR));
    const st = this.state;
    st.camAltKm = camR - 6360; st.dip = dip; st.sunDir = sunDir; st.moonDir = moonDir; st.sunE = sunE; st.moonE = moonE;

    bindFBO(gl, this.fSky);
    let p = this.pSky.use(); this._atmoU(p);
    p.set('uTransLUT', this.transLUT).set('uMSLUT', this.msLUT).set('uCamR', camR)
      .set('uSunDir', sunDir).set('uMoonDir', moonDir).set('uSunE', sunE).set('uMoonE', moonE);
    drawFullscreen(gl);

    bindFBO(gl, this.fAP);
    p = this.pAP.use(); this._atmoU(p);
    p.set('uTransLUT', this.transLUT).set('uMSLUT', this.msLUT).set('uCamR', camR)
      .set('uSunDir', sunDir).set('uMoonDir', moonDir).set('uSunE', sunE).set('uMoonE', moonE)
      .set('uRay00', rays[0]).set('uRay10', rays[1]).set('uRay01', rays[2]).set('uRay11', rays[3]).set('uAPMax', AP_MAX_KM);
    drawFullscreen(gl);

    bindFBO(gl, this.fIrr);
    p = this.pIrr.use();
    this.bind(p, [IRR_RES, IRR_RES]);
    if (p.has('uIrrMap')) p.set('uIrrMap', this.msLUT); // evita realimentación con el destino
    p.set('uGroundAlbedo', 0.15, 0.17, 0.12);
    drawFullscreen(gl);
    gl.depthMask(true);
  }

  // Asigna los uniforms/LUTs de consulta a un programa de escena.
  bind(prog, viewport) {
    const st = this.state;
    prog.set('uTransLUT', this.transLUT).set('uSkyBase', this.skyBase).set('uSkyMie', this.skyMie)
      .set('uAPScat', this.apScat).set('uAPTrans', this.apTrans).set('uIrrMap', this.irrMap)
      .set('uSunDir', st.sunDir).set('uMoonDir', st.moonDir).set('uSunE', st.sunE).set('uMoonE', st.moonE)
      .set('uAtmoCam', st.camAltKm, st.dip, AP_MAX_KM * 1000, this.params.g);
    if (viewport) prog.set('uViewport', viewport[0], viewport[1]);
  }
}
