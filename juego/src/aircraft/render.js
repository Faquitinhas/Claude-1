// Render del avión: PBR con reflejos del cielo, esquema de pintura procedural, piezas
// móviles animadas desde la física y mapa de sombras propio (el avión se sombrea a sí mismo
// y proyecta su sombra sobre el terreno).
import { GLSL_HEADER, Program, createTexture, createFBO, bindFBO } from '../core/gl.js';
import { m4 } from '../core/math.js';
import { GLSL_ATMO_SCENE } from '../world/atmosphere.js';
import { GLSL_TERRAIN_SAMPLING } from '../world/terrain.js';
import { GLSL_CLOUD_SHADOW } from '../world/clouds.js';
import { buildAircraft, MAT, PANEL } from './model.js';
import { GLSL_AC_SHADOW, SHADOW_RES, SHADOW_HALF, SHADOW_NEAR, SHADOW_FAR } from './shadowGlsl.js';

const VS = `${GLSL_HEADER}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec3 aCol;
layout(location = 3) in vec3 aMat;
uniform mat4 uViewProj;
uniform mat4 uModel;   // cuerpo -> relativo a cámara
uniform mat4 uPart;    // animación de la pieza (en ejes cuerpo)
out vec3 vRel;
out vec3 vN;
out vec3 vBody;
out vec3 vBodyN;
out vec3 vCol;
out vec3 vMat;
void main() {
  vec4 b = uPart * vec4(aPos, 1.0);
  vec3 bn = mat3(uPart) * aNrm;
  vec4 w = uModel * b;
  vRel = w.xyz;
  vN = mat3(uModel) * bn;
  vBody = aPos;
  vBodyN = aNrm;
  vCol = aCol;
  vMat = aMat;
  gl_Position = uViewProj * w;
}`;

const VS_SHADOW = `${GLSL_HEADER}
layout(location = 0) in vec3 aPos;
uniform mat4 uLightMat;  // cuerpo -> clip de sombra
uniform mat4 uPart;
void main() { gl_Position = uLightMat * (uPart * vec4(aPos, 1.0)); }`;
const FS_SHADOW = `${GLSL_HEADER}
out vec4 o;
void main() { o = vec4(1.0); }`;

const FS = `${GLSL_HEADER}
${GLSL_ATMO_SCENE}
${GLSL_TERRAIN_SAMPLING}
${GLSL_CLOUD_SHADOW}
${GLSL_AC_SHADOW}
uniform vec3 uCamPos;
uniform vec4 uParams;    // x: exposición, y: tiempo, z: alfa global, w: luces encendidas
uniform vec3 uLightDir;  // luz principal (sombras)
uniform sampler2D uPanelTex;
uniform vec4 uPanelRect; // x0, y0, 1/ancho, 1/alto
uniform vec4 uCabin;     // x: iluminación integral del tablero, y: vista interior (1) o exterior (0)
in vec3 vRel;
in vec3 vN;
in vec3 vBody;
in vec3 vBodyN;
in vec3 vCol;
in vec3 vMat;
out vec4 o;

float D_GGX(float nh, float a) { float a2 = a * a; float d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float V_Smith(float nv, float nl, float a) {
  float k = a * 0.5;
  return 0.25 / ((nv * (1.0 - k) + k) * (nl * (1.0 - k) + k));
}
vec3 F_Schlick(vec3 f0, float vh) { return f0 + (1.0 - f0) * pow(1.0 - vh, 5.0); }
// Radiancia del entorno en una dirección (cielo arriba, suelo aproximado abajo).
vec3 envRadiance(vec3 d, float rough) {
  vec3 gnd = skyIrradiance(vec3(0.0, -1.0, 0.0)) / PI * 1.6;
  vec3 sky = skyRadianceSoft(normalize(vec3(d.x, max(d.y, 0.0) + 0.02, d.z)));
  vec3 blur = skyIrradiance(d) / PI;
  vec3 sharp = mix(gnd, sky, smoothstep(-0.12, 0.04, d.y));
  return mix(sharp, blur, clamp(rough * 1.6, 0.0, 1.0));
}

void main() {
  int id = int(vMat.z + 0.5);
  float rough = vMat.x, metal = vMat.y;
  vec3 alb = vCol;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vRel);
  vec3 wp = uCamPos + vRel;
  float clear = 0.0;   // barniz
  // ---- esquema de pintura ----
  const vec3 BLUE = vec3(0.012, 0.055, 0.26), RED = vec3(0.46, 0.015, 0.015);
  if (id == ${MAT.FUSELAGE}) {
    clear = 1.0;
    float z = vBody.z, y = vBody.y;
    float side = smoothstep(0.25, 0.6, abs(vBodyN.x));
    // Franja que nace en el capó y sube hacia la cola.
    float base = -0.20 + 0.035 * (z + 1.9) + 0.012 * max(z - 1.2, 0.0) * max(z - 1.2, 0.0);
    float s = y - base;
    float w = 0.15 * (1.0 - smoothstep(2.5, 5.4, z) * 0.75);
    float band = smoothstep(-w, -w + 0.012, s) * (1.0 - smoothstep(0.0, 0.012, s));
    float pin = smoothstep(0.03, 0.04, s) * (1.0 - smoothstep(0.065, 0.075, s));
    float lim = smoothstep(-1.86, -1.7, z) * (1.0 - smoothstep(5.2, 5.5, z));
    alb = mix(alb, BLUE, band * side * lim);
    alb = mix(alb, RED, pin * side * lim);
  } else if (id == ${MAT.WING}) {
    clear = 1.0;
    float ax = abs(vBody.x);
    alb = mix(alb, BLUE, smoothstep(5.02, 5.04, ax));
    alb = mix(alb, RED, smoothstep(4.93, 4.945, ax) * (1.0 - smoothstep(4.975, 4.99, ax)));
  } else if (id == ${MAT.TAIL}) {
    clear = 1.0;
    float y = vBody.y;
    float isFin = step(0.5, abs(vBodyN.x)) * step(0.45, y);
    float t = y - 0.18 * (vBody.z - 4.2);
    alb = mix(alb, BLUE, isFin * smoothstep(1.36, 1.375, t));
    alb = mix(alb, RED, isFin * smoothstep(1.27, 1.282, t) * (1.0 - smoothstep(1.315, 1.327, t)));
    float ax = abs(vBody.x);
    alb = mix(alb, BLUE, (1.0 - isFin) * step(y, 0.4) * smoothstep(1.55, 1.565, ax));
  } else if (id == ${MAT.PAINT}) {
    clear = 1.0;
  }
  bool interior = id == ${MAT.INTERIOR} || id == ${MAT.PANEL};
  vec3 panelGlow = vec3(0.0);
  if (id == ${MAT.PANEL}) {
    vec2 uv = vec2((vBody.x - uPanelRect.x) * uPanelRect.z, 1.0 - (vBody.y - uPanelRect.y) * uPanelRect.w);
    vec3 t = texture(uPanelTex, uv).rgb;
    alb = pow(t, vec3(2.2));
    rough = 0.6;
    panelGlow = alb * uCabin.x;
  }
  // ---- luces del avión (emisivas) ----
  vec3 emis = vec3(0.0);
  if (id == ${MAT.LIGHT_RED} || id == ${MAT.LIGHT_GREEN} || id == ${MAT.LIGHT_WHITE}) {
    float on = uParams.w;
    float blink = 1.0;
    if (id == ${MAT.LIGHT_RED} && vBody.y > 1.5) blink = step(0.86, fract(uParams.y * 0.9));       // baliza
    if (id == ${MAT.LIGHT_WHITE} && vBody.z > 5.0) blink = 0.6;
    emis = vCol * on * blink * 4.0e-4 * uParams.x * (id == ${MAT.LIGHT_WHITE} && vBody.z < 0.0 ? 6.0 : 1.0);
  }

  float alt = wp.y;
  vec3 sunT = lightTransmittance(alt, uSunDir.y);
  float sh = terrainShadow(wp.xz) * cloudShadow(wp);
  float nlMain = dot(N, uLightDir);
  sh *= aircraftShadow(vRel + N * 0.02, 0.00003) ;
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 diff = alb * (1.0 - metal);
  float a = max(rough * rough, 0.002);
  float nv = max(dot(N, V), 1e-3);
  vec3 col = vec3(0.0);
  // dos luces direccionales: Sol (con sombras si es la principal) y Luna
  for (int i = 0; i < 2; i++) {
    vec3 L = i == 0 ? uSunDir : uMoonDir;
    vec3 E = i == 0 ? uSunE * sunT : uMoonE * lightTransmittance(alt, uMoonDir.y);
    float isMain = step(0.999, dot(L, uLightDir));
    E *= mix(1.0, sh, isMain);
    float nl = max(dot(N, L), 0.0);
    if (nl <= 0.0) continue;
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0), vh = max(dot(V, H), 0.0);
    vec3 F = F_Schlick(f0, vh);
    vec3 spec = F * D_GGX(nh, a) * V_Smith(nv, nl, a);
    vec3 c = (diff / PI * (1.0 - F) + spec) * E * nl;
    if (clear > 0.0) {
      float ac = 0.0025;
      float Fc = 0.04 + 0.96 * pow(1.0 - vh, 5.0);
      c = c * (1.0 - Fc * 0.9) + Fc * min(D_GGX(nh, ac) * V_Smith(nv, nl, ac), 4000.0) * E * nl;
    }
    col += c;
  }
  // ambiente difuso + reflejo del entorno
  float ao = 0.82 + 0.18 * smoothstep(-0.9, 0.3, N.y);
  if (interior) {
    // Dentro de la cabina la luz difusa entra por las ventanas: mezcla de cielo y suelo, atenuada.
    vec3 Ecab = skyIrradiance(vec3(0.0, 1.0, 0.0)) * 0.55 + skyIrradiance(vec3(0.0, -1.0, 0.0)) * 0.8 + skyIrradiance(N) * 0.5;
    // El ojo se adapta al interior: se realza la luz de cabina (más aún en el tablero).
    col += diff / PI * Ecab * (id == ${MAT.PANEL} ? 3.2 : 1.5);
    col += panelGlow;
  } else {
    col += diff / PI * skyIrradiance(N) * ao;
    vec3 R = reflect(-V, N);
    vec3 Fe = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - nv, 5.0);
    col += envRadiance(R, rough) * Fe * ao;
    if (clear > 0.0) {
      float Fc = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
      col = col * (1.0 - Fc * 0.9) + envRadiance(R, 0.03) * Fc * ao;
    }
  }
  col += emis;
  col = applyAP(col, vRel);
  o = vec4(col, uParams.z);
}`;

// Disco de la hélice en giro (translúcido).
const FS_DISC = `${GLSL_HEADER}
${GLSL_ATMO_SCENE}
uniform vec4 uParams;   // x: opacidad, y: ángulo, z: -, w: -
uniform vec3 uHub;
in vec3 vRel;
in vec3 vN;
in vec3 vBody;
in vec3 vBodyN;
in vec3 vCol;
in vec3 vMat;
out vec4 o;
void main() {
  vec2 d = vBody.xy - uHub.xy;
  float r = length(d) / 0.9525;
  float ang = atan(d.y, d.x) - uParams.y;
  // Dos palas difuminadas por el giro: más opacas cerca del buje (más cuerda por arco recorrido).
  float blade = 0.62 + 0.38 * pow(abs(cos(ang)), 4.0);
  float radial = smoothstep(0.15, 0.22, r) * (1.0 - smoothstep(0.97, 1.0, r));
  float dens = mix(1.0, 0.42, smoothstep(0.2, 1.0, r));
  float a = uParams.x * blade * radial * dens;
  vec3 c = mix(vec3(0.022, 0.022, 0.024), vec3(0.42, 0.33, 0.04), smoothstep(0.925, 0.945, r) * 0.8);
  vec3 light = (uSunE * lightTransmittance(1000.0, uSunDir.y) * 0.3 + skyIrradiance(vec3(0.0, 1.0, 0.0))) / PI;
  o = vec4(c * light, a);
}`;

function partMatrix(out, pivot, axis, angle, tx = 0, ty = 0, tz = 0) {
  // T(t) · T(pivot) · R(axis, angle) · T(-pivot)
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  const [x, y, z] = axis;
  const r = [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
  const px = pivot[0], py = pivot[1], pz = pivot[2];
  r[12] = px - (r[0] * px + r[4] * py + r[8] * pz) + tx;
  r[13] = py - (r[1] * px + r[5] * py + r[9] * pz) + ty;
  r[14] = pz - (r[2] * px + r[6] * py + r[10] * pz) + tz;
  for (let i = 0; i < 16; i++) out[i] = r[i];
  return out;
}

export class AircraftRenderer {
  constructor(gl) {
    this.gl = gl;
    const mesh = buildAircraft();
    this.mesh = mesh;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 48, i * 12);
    }
    gl.bindVertexArray(null);
    this.prog = new Program(gl, VS, FS, 'aircraft');
    this.progShadow = new Program(gl, VS_SHADOW, FS_SHADOW, 'aircraftShadow');
    this.progDisc = new Program(gl, VS, FS_DISC, 'propDisc');
    this.panelTex = createTexture(gl, { width: 2048, height: 880, format: 'rgba8', mips: true, wrap: 'clamp', aniso: 8 });
    this.cockpitView = false;
    this.panelGlow = 0;
    this.shadowTex = createTexture(gl, { width: SHADOW_RES, height: SHADOW_RES, format: 'depth24', filter: 'linear', compare: true });
    this.shadowFBO = createFBO(gl, [], this.shadowTex);
    this.partM = {};
    for (const name in mesh.parts) this.partM[name] = m4.create();
    this.model = m4.create();
    this.shadowMat = m4.create();
    this.shadowOn = false;
    this.propAngle = 0;
    this.wheelAngle = [0, 0, 0];
    this.state = { rpm: 0 };
    this.lightsOn = 1;
    this.visible = true;
  }

  // Actualiza las matrices de las piezas a partir del estado de la física.
  update(ac, dt) {
    const P = this.mesh.parts, M = this.partM, c = ac.ctl, D = Math.PI / 180;
    const ail = c.aileron;
    partMatrix(M.aileronR, P.aileronR.pivot, P.aileronR.axis, (ail > 0 ? 20 : 15) * ail * D);
    partMatrix(M.aileronL, P.aileronL.pivot, P.aileronL.axis, (ail > 0 ? 15 : 20) * ail * D);
    const fl = c.flaps * 30 * D;
    partMatrix(M.flapR, P.flapR.pivot, P.flapR.axis, -fl, 0, -0.03 * c.flaps, 0.10 * c.flaps);
    partMatrix(M.flapL, P.flapL.pivot, P.flapL.axis, fl, 0, -0.03 * c.flaps, 0.10 * c.flaps);
    partMatrix(M.elevator, P.elevator.pivot, P.elevator.axis, (c.elevator > 0 ? 28 : 23) * c.elevator * D);
    partMatrix(M.rudder, P.rudder.pivot, P.rudder.axis, -17.5 * c.rudder * D);
    this.propAngle = (this.propAngle + ac.engine.omega * dt) % (Math.PI * 2);
    partMatrix(M.prop, P.prop.pivot, [0, 0, -1], this.propAngle);
    partMatrix(M.spinner, P.spinner.pivot, [0, 0, -1], this.propAngle);
    partMatrix(M.propDisc, P.propDisc.pivot, [0, 0, 1], 0);
    this.state.rpm = ac.engine.rpm;
    const g = ac.gear;
    const collapsed = ac.damage.gear ? 0.5 : 0;
    for (let i = 0; i < 3; i++) this.wheelAngle[i] = (this.wheelAngle[i] + g[i].spin * dt) % (Math.PI * 2);
    const cn = Math.min(g[0].comp, 0.26) + collapsed, cl = Math.min(g[1].comp, 0.26) + collapsed, cr = Math.min(g[2].comp, 0.26) + collapsed;
    const steer = g[0].steerAngle || 0;
    // rueda de morro: gira con la dirección alrededor del eje del amortiguador y sube con la compresión
    const mSteer = partMatrix(m4.create(), P.strutN.pivot, [0, 1, 0], steer, 0, cn, 0);
    const mSpinN = partMatrix(m4.create(), P.wheelN.pivot, [-1, 0, 0], this.wheelAngle[0]);
    m4.mul(M.wheelN, mSteer, mSpinN);
    m4.copy(M.forkN, mSteer);
    partMatrix(M.strutN, P.strutN.pivot, [0, 1, 0], 0);
    partMatrix(M.wheelL, P.wheelL.pivot, [-1, 0, 0], this.wheelAngle[1], 0, cl, 0);
    partMatrix(M.wheelR, P.wheelR.pivot, [-1, 0, 0], this.wheelAngle[2], 0, cr, 0);
    partMatrix(M.legL, P.legL.pivot, [0, 0, 1], -cl / 0.78);
    partMatrix(M.legR, P.legR.pivot, [0, 0, 1], cr / 0.78);
    m4.identity(M.body);
    m4.identity(M.glass);
    m4.identity(M.cockpit);
    // yugos: giran con el alabeo y se desplazan con el cabeceo
    const yr = c.aileron * 0.95, yz = c.elevator * 0.075;
    partMatrix(M.yokeL, P.yokeL.pivot, [0, 0, -1], yr, 0, 0, yz);
    partMatrix(M.yokeR, P.yokeR.pivot, [0, 0, -1], yr, 0, 0, yz);
  }

  // Sube el canvas del panel de instrumentos a su textura.
  updatePanel(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.panelTex.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  _visible(name, shadowPass) {
    if (name === 'propDisc') return false;
    if (name === 'prop' && this.state.rpm > 500) return false;
    const inside = name === 'cockpit' || name === 'yokeL' || name === 'yokeR';
    if (shadowPass) return name !== 'glass' && name !== 'yokeL' && name !== 'yokeR';
    if (this.cockpitView) return name !== 'glass';
    return !inside;
  }

  _drawParts(prog, filter) {
    const gl = this.gl;
    for (const name in this.mesh.parts) {
      if (!filter(name)) continue;
      prog.set('uPart', this.partM[name]);
      for (const [start, n] of this.mesh.parts[name].ranges) gl.drawArrays(gl.TRIANGLES, start, n);
    }
  }

  // Calcula modelo y matriz de sombra, y renderiza el mapa de profundidad desde la luz.
  renderShadow(ctx, pos, q) {
    const gl = this.gl, { cam, env } = ctx;
    const rel = [pos[0] - cam.pos[0], pos[1] - cam.pos[1], pos[2] - cam.pos[2]];
    m4.fromQuatPos(this.model, q, rel);
    const L = env.primaryLight;
    this.shadowOn = this.visible && L[1] > 0.02;
    if (!this.shadowOn) return;
    // base ortonormal de la luz
    const f = [-L[0], -L[1], -L[2]]; // dirección de avance de la luz
    let up = Math.abs(L[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const r = norm3(cross3(up, L));
    const u = cross3(L, r);
    // centro algo desplazado hacia la cola para cubrir todo el avión
    const lv = new Float32Array([r[0], u[0], L[0], 0, r[1], u[1], L[1], 0, r[2], u[2], L[2], 0, 0, 0, 0, 1]);
    const c = [rel[0] + this._bodyZ(q)[0] * 1.9, rel[1] + this._bodyZ(q)[1] * 1.9, rel[2] + this._bodyZ(q)[2] * 1.9];
    const t = m4.translate(m4.create(), -c[0], -c[1], -c[2]);
    const view = m4.mul(m4.create(), lv, t);
    // en espacio de luz, +Z apunta hacia la luz; la profundidad crece alejándose de ella (-Z)
    const proj = m4.ortho(m4.create(), -SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, SHADOW_HALF, SHADOW_NEAR, SHADOW_FAR);
    m4.mul(this.shadowMat, proj, view);
    void f;
    const lightBody = m4.mul(m4.create(), this.shadowMat, this.model);
    bindFBO(gl, this.shadowFBO);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3.0);
    gl.colorMask(false, false, false, false);
    const p = this.progShadow.use();
    p.set('uLightMat', lightBody);
    gl.bindVertexArray(this.vao);
    this._drawParts(p, (n) => this._visible(n, true));
    gl.colorMask(true, true, true, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindVertexArray(null);
  }

  _bodyZ(q) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
  }

  // Uniforms del receptor de sombra (para el shader de terreno y el propio avión).
  bindShadow(p) {
    p.set('uAcShadowTex', this.shadowTex).set('uAcShadowMat', this.shadowMat);
    p.set('uAcShadowP', this.shadowOn ? 1 : 0, 1 / SHADOW_RES, SHADOW_FAR - SHADOW_NEAR, -SHADOW_NEAR);
  }

  render(ctx, opts = {}) {
    if (!this.visible) return;
    const gl = this.gl, { cam, env, atmosphere, terrain, clouds, viewport, exposure } = ctx;
    const p = this.prog.use();
    atmosphere.bind(p, viewport);
    terrain.bindSampling(p);
    clouds.bindShadow(p, env.primaryLight);
    this.bindShadow(p);
    p.set('uViewProj', opts.viewProj || cam.viewProj).set('uModel', this.model);
    p.set('uCamPos', cam.pos[0], cam.pos[1], cam.pos[2]).set('uLightDir', env.primaryLight);
    p.set('uParams', exposure, env.time, 1, this.lightsOn);
    this.cockpitView = !!opts.cockpit;
    p.set('uPanelTex', this.panelTex).set('uPanelRect', PANEL.x0, PANEL.y0, 1 / PANEL.w, 1 / PANEL.h);
    p.set('uCabin', this.panelGlow, this.cockpitView ? 1 : 0, 0, 0);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
    const rpm = this.state.rpm;
    const fast = rpm > 500;
    this._drawParts(p, (n) => this._visible(n, false));
    // hélice: palas nítidas a pocas vueltas; disco difuminado al girar rápido
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
    if (fast) {
      const d = this.progDisc.use();
      atmosphere.bind(d, viewport);
      d.set('uViewProj', opts.viewProj || cam.viewProj).set('uModel', this.model).set('uPart', this.partM.propDisc);
      d.set('uHub', this.mesh.hub).set('uParams', Math.min(0.30 + rpm / 9000, 0.55), this.propAngle * 0.13, 0, 0);
      for (const [start, n] of this.mesh.parts.propDisc.ranges) gl.drawArrays(gl.TRIANGLES, start, n);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}

function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
