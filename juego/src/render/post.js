// Post-proceso: destino HDR, bloom (cadena de reducción/ampliación), medición de luminancia
// para exposición automática (lectura asíncrona), tonemapping, FXAA y escalado final.
import { GLSL_HEADER, FULLSCREEN_VS, Program, createTexture, createFBO, bindFBO, drawFullscreen } from '../core/gl.js';

const FS_DOWN = `${GLSL_HEADER}
uniform sampler2D uTex;
uniform vec2 uTexel;   // 1 / tamaño de la textura fuente
uniform float uFirst;  // 1 = primer nivel (media ponderada anti-luciérnagas)
in vec2 vUV; out vec4 o;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 a = textureLod(uTex, vUV + uTexel * vec2(-2.0, 2.0), 0.0).rgb;
  vec3 b = textureLod(uTex, vUV + uTexel * vec2(0.0, 2.0), 0.0).rgb;
  vec3 c = textureLod(uTex, vUV + uTexel * vec2(2.0, 2.0), 0.0).rgb;
  vec3 d = textureLod(uTex, vUV + uTexel * vec2(-2.0, 0.0), 0.0).rgb;
  vec3 e = textureLod(uTex, vUV, 0.0).rgb;
  vec3 f = textureLod(uTex, vUV + uTexel * vec2(2.0, 0.0), 0.0).rgb;
  vec3 g = textureLod(uTex, vUV + uTexel * vec2(-2.0, -2.0), 0.0).rgb;
  vec3 h = textureLod(uTex, vUV + uTexel * vec2(0.0, -2.0), 0.0).rgb;
  vec3 i = textureLod(uTex, vUV + uTexel * vec2(2.0, -2.0), 0.0).rgb;
  vec3 j = textureLod(uTex, vUV + uTexel * vec2(-1.0, 1.0), 0.0).rgb;
  vec3 k = textureLod(uTex, vUV + uTexel * vec2(1.0, 1.0), 0.0).rgb;
  vec3 l = textureLod(uTex, vUV + uTexel * vec2(-1.0, -1.0), 0.0).rgb;
  vec3 m = textureLod(uTex, vUV + uTexel * vec2(1.0, -1.0), 0.0).rgb;
  vec3 r;
  if (uFirst > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = 1.0 / (1.0 + lum(g0)), w1 = 1.0 / (1.0 + lum(g1)), w2 = 1.0 / (1.0 + lum(g2)), w3 = 1.0 / (1.0 + lum(g3)), w4 = 1.0 / (1.0 + lum(g4));
    r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (0.125 * (w0 + w1 + w2 + w3) + 0.5 * w4);
  } else {
    r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  o = vec4(max(r, vec3(0.0)), 1.0);
}`;

const FS_UP = `${GLSL_HEADER}
uniform sampler2D uTex;
uniform vec2 uTexel;
in vec2 vUV; out vec4 o;
void main() {
  vec2 d = uTexel;
  vec3 r = textureLod(uTex, vUV, 0.0).rgb * 4.0;
  r += (textureLod(uTex, vUV + vec2(d.x, 0.0), 0.0).rgb + textureLod(uTex, vUV - vec2(d.x, 0.0), 0.0).rgb
      + textureLod(uTex, vUV + vec2(0.0, d.y), 0.0).rgb + textureLod(uTex, vUV - vec2(0.0, d.y), 0.0).rgb) * 2.0;
  r += textureLod(uTex, vUV + d, 0.0).rgb + textureLod(uTex, vUV - d, 0.0).rgb
     + textureLod(uTex, vUV + vec2(d.x, -d.y), 0.0).rgb + textureLod(uTex, vUV + vec2(-d.x, d.y), 0.0).rgb;
  o = vec4(r / 16.0, 1.0);
}`;

// Media logarítmica de luminancia de la escena (ponderada al centro) empaquetada en RGBA8.
const FS_METER = `${GLSL_HEADER}
uniform sampler2D uTex;
out vec4 o;
void main() {
  float sum = 0.0, wsum = 0.0;
  for (int y = 0; y < 9; y++) for (int x = 0; x < 16; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(16.0, 9.0);
    vec3 c = textureLod(uTex, uv, 0.0).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec2 q = uv - 0.5;
    float w = 1.0 - 0.6 * dot(q, q) * 2.0;
    sum += log2(max(l, 1e-7)) * w; wsum += w;
  }
  float v = clamp((sum / wsum + 24.0) / 40.0, 0.0, 1.0);   // log2 en [-24, 16]
  float hi = floor(v * 255.0);
  float lo = fract(v * 255.0);
  o = vec4(hi / 255.0, lo, 0.0, 1.0);
}`;

const FS_TONEMAP = `${GLSL_HEADER}
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec4 uParams;   // x: intensidad bloom, y: viñeta, z: noche (0..1), w: tiempo
uniform vec4 uParams2;  // x: operador (0 ACES, 1 AgX), y: saturación, z: contraste, w: 1/niveles de bloom
in vec2 vUV; out vec4 o;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = inM * c;
  c = RRTAndODTFit(c);
  return clamp(outM * c, 0.0, 1.0);
}
vec3 agxCurve(vec3 x) {
  vec3 x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 c) {
  const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                      0.0784335999999992, 0.878468636469772, 0.0784336,
                      0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                       -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                       -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  const float minEv = -12.47393, maxEv = 4.026069;
  c = m * max(c, vec3(0.0));
  c = clamp(log2(max(c, vec3(1e-10))), minEv, maxEv);
  c = (c - minEv) / (maxEv - minEv);
  c = agxCurve(c);
  // "look" con algo más de contraste y saturación
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = pow(max(c, vec3(0.0)), vec3(1.22));
  c = l + 1.28 * (c - l);
  c = mi * c;
  return clamp(c, 0.0, 1.0);   // ya codificado para pantalla (gamma 2.2)
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec3 c = textureLod(uScene, vUV, 0.0).rgb;
  vec3 bl = textureLod(uBloom, vUV, 0.0).rgb;
  c = mix(c, bl * uParams2.w, uParams.x);
  // Visión nocturna: la escena muy oscura pierde color y vira al azul.
  if (uParams.z > 0.0) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 scot = l * vec3(0.72, 0.92, 1.35);
    c = mix(c, scot, uParams.z * (1.0 - smoothstep(0.0, 0.9, l)));
  }
  vec2 q = vUV - 0.5;
  c *= 1.0 - uParams.y * dot(q, q) * 1.6;
  vec3 r;
  if (uParams2.x < 0.5) r = toSRGB(aces(c * 1.0));
  else r = agx(c);
  float lr = dot(r, vec3(0.2126, 0.7152, 0.0722));
  r = mix(vec3(lr), r, uParams2.y);
  r = (r - 0.5) * uParams2.z + 0.5;
  r += (ign(gl_FragCoord.xy + uParams.w * 60.0) - 0.5) / 255.0;
  o = vec4(clamp(r, 0.0, 1.0), dot(clamp(r, 0.0, 1.0), vec3(0.299, 0.587, 0.114)));
}`;

// FXAA 3.11 (calidad media) + escalado. La luminancia viene en alfa.
const FS_FXAA = `${GLSL_HEADER}
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uOn;
in vec2 vUV; out vec4 o;
void main() {
  vec4 cM = textureLod(uTex, vUV, 0.0);
  if (uOn < 0.5) { o = vec4(cM.rgb, 1.0); return; }
  float lM = cM.a;
  float lN = textureLod(uTex, vUV + vec2(0.0, uTexel.y), 0.0).a;
  float lS = textureLod(uTex, vUV - vec2(0.0, uTexel.y), 0.0).a;
  float lE = textureLod(uTex, vUV + vec2(uTexel.x, 0.0), 0.0).a;
  float lW = textureLod(uTex, vUV - vec2(uTexel.x, 0.0), 0.0).a;
  float lMin = min(lM, min(min(lN, lS), min(lE, lW)));
  float lMax = max(lM, max(max(lN, lS), max(lE, lW)));
  float range = lMax - lMin;
  if (range < max(0.0312, lMax * 0.125)) { o = vec4(cM.rgb, 1.0); return; }
  float lNW = textureLod(uTex, vUV + vec2(-uTexel.x, uTexel.y), 0.0).a;
  float lNE = textureLod(uTex, vUV + vec2(uTexel.x, uTexel.y), 0.0).a;
  float lSW = textureLod(uTex, vUV + vec2(-uTexel.x, -uTexel.y), 0.0).a;
  float lSE = textureLod(uTex, vUV + vec2(uTexel.x, -uTexel.y), 0.0).a;
  float lNS = lN + lS, lWE = lW + lE;
  float subL = (2.0 * (lNS + lWE) + lNW + lNE + lSW + lSE) / 12.0;
  float sub = clamp(abs(subL - lM) / range, 0.0, 1.0);
  sub = smoothstep(0.0, 1.0, sub); sub = sub * sub * 0.75;
  float edgeH = abs(lNW + lSW - 2.0 * lW) + abs(lN + lS - 2.0 * lM) * 2.0 + abs(lNE + lSE - 2.0 * lE);
  float edgeV = abs(lNW + lNE - 2.0 * lN) + abs(lW + lE - 2.0 * lM) * 2.0 + abs(lSW + lSE - 2.0 * lS);
  bool horz = edgeV >= edgeH;
  float l1 = horz ? lS : lW, l2 = horz ? lN : lE;
  float g1 = l1 - lM, g2 = l2 - lM;
  bool steep1 = abs(g1) >= abs(g2);
  float gradS = 0.25 * max(abs(g1), abs(g2));
  float stepLen = horz ? uTexel.y : uTexel.x;
  float lAvg;
  if (steep1) { stepLen = -stepLen; lAvg = 0.5 * (l1 + lM); } else lAvg = 0.5 * (l2 + lM);
  vec2 uv = vUV;
  if (horz) uv.y += stepLen * 0.5; else uv.x += stepLen * 0.5;
  vec2 off = horz ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y);
  vec2 uv1 = uv - off, uv2 = uv + off;
  float e1 = textureLod(uTex, uv1, 0.0).a - lAvg, e2 = textureLod(uTex, uv2, 0.0).a - lAvg;
  bool r1 = abs(e1) >= gradS, r2 = abs(e2) >= gradS;
  for (int i = 0; i < 8; i++) {
    if (r1 && r2) break;
    float st = i < 2 ? 1.0 : (i < 5 ? 2.0 : 4.0);
    if (!r1) { uv1 -= off * st; e1 = textureLod(uTex, uv1, 0.0).a - lAvg; r1 = abs(e1) >= gradS; }
    if (!r2) { uv2 += off * st; e2 = textureLod(uTex, uv2, 0.0).a - lAvg; r2 = abs(e2) >= gradS; }
  }
  float d1 = horz ? vUV.x - uv1.x : vUV.y - uv1.y;
  float d2 = horz ? uv2.x - vUV.x : uv2.y - vUV.y;
  bool dir1 = d1 < d2;
  float dMin = min(d1, d2), len = d1 + d2;
  bool lessM = lM < lAvg;
  bool ok = ((dir1 ? e1 : e2) < 0.0) != lessM;
  float pixOff = ok ? (0.5 - dMin / len) : 0.0;
  float fin = max(pixOff, sub);
  vec2 fuv = vUV;
  if (horz) fuv.y += fin * stepLen; else fuv.x += fin * stepLen;
  o = vec4(textureLod(uTex, fuv, 0.0).rgb, 1.0);
}`;

export class PostFX {
  constructor(gl) {
    this.gl = gl;
    this.pDown = new Program(gl, FULLSCREEN_VS, FS_DOWN, 'bloomDown');
    this.pUp = new Program(gl, FULLSCREEN_VS, FS_UP, 'bloomUp');
    this.pMeter = new Program(gl, FULLSCREEN_VS, FS_METER, 'meter');
    this.pTone = new Program(gl, FULLSCREEN_VS, FS_TONEMAP, 'tonemap');
    this.pFxaa = new Program(gl, FULLSCREEN_VS, FS_FXAA, 'fxaa');
    this.w = 0; this.h = 0;
    this.levels = [];
    this.meterTex = createTexture(gl, { width: 1, height: 1, format: 'rgba8', filter: 'nearest' });
    this.meterFBO = createFBO(gl, [this.meterTex]);
    this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.sync = null;
    this.syncExposure = 1;
    this.measured = null;   // {logLum (pre-expuesto), exposure}
    this.settings = { bloom: 0.045, vignette: 0.22, operator: 1, saturation: 1.0, contrast: 1.0, fxaa: true };
    this._buf = new Uint8Array(4);
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.dispose();
    this.w = w; this.h = h;
    this.sceneColor = createTexture(gl, { width: w, height: h, format: 'rgba16f', filter: 'linear' });
    this.sceneDepth = createTexture(gl, { width: w, height: h, format: 'depth24', filter: 'nearest' });
    this.sceneFBO = createFBO(gl, [this.sceneColor], this.sceneDepth);
    this.ldr = createTexture(gl, { width: w, height: h, format: 'rgba8', filter: 'linear' });
    this.ldrFBO = createFBO(gl, [this.ldr]);
    this.levels = [];
    let lw = w, lh = h;
    for (let i = 0; i < 7; i++) {
      lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1);
      const d = createTexture(gl, { width: lw, height: lh, format: 'rgba16f', filter: 'linear' });
      const u = createTexture(gl, { width: lw, height: lh, format: 'rgba16f', filter: 'linear' });
      this.levels.push({ w: lw, h: lh, down: d, up: u, fDown: createFBO(gl, [d]), fUp: createFBO(gl, [u]) });
      if (lw <= 8 || lh <= 8) break;
    }
  }

  dispose() {
    const gl = this.gl;
    if (!this.sceneColor) return;
    for (const t of [this.sceneColor, this.sceneDepth, this.ldr]) gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(this.sceneFBO.fbo); gl.deleteFramebuffer(this.ldrFBO.fbo);
    for (const l of this.levels) {
      gl.deleteTexture(l.down.tex); gl.deleteTexture(l.up.tex);
      gl.deleteFramebuffer(l.fDown.fbo); gl.deleteFramebuffer(l.fUp.fbo);
    }
    this.sceneColor = null;
  }

  // Consulta (sin bloquear) el resultado de la medición lanzada en un frame anterior.
  pollMeter() {
    const gl = this.gl;
    if (!this.sync) return null;
    const st = gl.clientWaitSync(this.sync, 0, 0);
    if (st === gl.TIMEOUT_EXPIRED) return null;
    gl.deleteSync(this.sync);
    this.sync = null;
    if (st === gl.WAIT_FAILED) return null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this._buf);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const v = (this._buf[0] + this._buf[1] / 255) / 255;
    return { logLum: v * 40 - 24, exposure: this.syncExposure };
  }

  // Ejecuta la cadena completa. exposure = la usada al renderizar la escena.
  render(outW, outH, exposure, time, night) {
    const gl = this.gl, s = this.settings;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    // Bloom: reducción
    let src = this.sceneColor, sw = this.w, sh = this.h;
    this.pDown.use();
    this.levels.forEach((l, i) => {
      bindFBO(gl, l.fDown);
      this.pDown.set('uTex', src).set('uTexel', 1 / sw, 1 / sh).set('uFirst', i === 0 ? 1 : 0);
      drawFullscreen(gl);
      src = l.down; sw = l.w; sh = l.h;
    });
    // Medición de luminancia (sobre el nivel más pequeño)
    if (!this.sync) {
      const last = this.levels[this.levels.length - 1];
      bindFBO(gl, this.meterFBO);
      this.pMeter.use().set('uTex', last.down);
      drawFullscreen(gl);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      this.syncExposure = exposure;
      gl.flush();
    }
    // Bloom: ampliación acumulativa
    const n = this.levels.length;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    this.pUp.use();
    let prev = this.levels[n - 1].down;
    for (let i = n - 2; i >= 0; i--) {
      const l = this.levels[i];
      bindFBO(gl, l.fUp);
      gl.disable(gl.BLEND);
      // copia del nivel reducido + ampliación del nivel inferior
      this.pUp.set('uTex', l.down).set('uTexel', 0, 0);
      drawFullscreen(gl);
      gl.enable(gl.BLEND);
      const pl = this.levels[i + 1];
      this.pUp.set('uTex', prev).set('uTexel', 1 / pl.w, 1 / pl.h);
      drawFullscreen(gl);
      prev = l.up;
    }
    gl.disable(gl.BLEND);
    // Tonemap -> LDR
    bindFBO(gl, this.ldrFBO);
    this.pTone.use().set('uScene', this.sceneColor).set('uBloom', prev)
      .set('uParams', s.bloom, s.vignette, night, time % 100)
      .set('uParams2', s.operator, s.saturation, s.contrast, 1 / Math.max(1, n - 1));
    drawFullscreen(gl);
    // FXAA + escalado a pantalla
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    this.pFxaa.use().set('uTex', this.ldr).set('uTexel', 1 / this.w, 1 / this.h).set('uOn', s.fxaa ? 1 : 0);
    drawFullscreen(gl);
    gl.depthMask(true);
  }
}
