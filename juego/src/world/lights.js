// Luces de aeródromo como fuentes puntuales fotométricas: cada luz tiene una intensidad
// (candelas relativas) y su brillo en pantalla sigue la ley del inverso del cuadrado, de modo
// que de día apenas se ven y de noche (exposición alta) destacan a kilómetros.
// Incluye bordes de pista, umbral/fin, luces de aproximación, rodaje, baliza giratoria y
// PAPI: cuatro proyectores que se ven blancos o rojos según el ángulo de descenso real.
import { GLSL_HEADER, Program } from '../core/gl.js';
import { GLSL_ATMO_SCENE, EARTH_RADIUS } from './atmosphere.js';
import { AIRPORTS, runwayPoint, PAVED } from './airports.js';

const DEG = Math.PI / 180;
// tipos
const OMNI = 0, BAR = 2, PAPI = 3, APPROACH = 4, BEACON = 5, BLINK = 6;

const VS = `${GLSL_HEADER}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPos;     // xyz mundo, w tipo
layout(location = 2) in vec4 aCol;     // rgb, intensidad (relativa al Sol = 1)
layout(location = 3) in vec4 aDir;     // xz dirección de referencia, z: parámetro (ángulo PAPI), w: fase
#define VERTEX_STAGE
${GLSL_ATMO_SCENE}
uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec4 uParams;   // x: exposición, y: tiempo, z: píxeles por radián, w: escala global
out vec2 vUV;
out vec3 vCol;
void main() {
  vec3 rel = aPos.xyz - uCamPos;
  float dh = dot(rel.xz, rel.xz);
  rel.y -= dh / (2.0 * ${EARTH_RADIUS.toFixed(1)});
  float d = max(length(rel), 1.0);
  vec3 toCam = -rel / d;
  int type = int(aPos.w + 0.5);
  vec3 col = aCol.rgb;
  float I = aCol.a;
  vec2 dir = aDir.xy;
  vec2 th = normalize(toCam.xz + 1e-6);
  float along = dot(th, dir);                 // >0: el observador está del lado 'dir'
  if (type == ${BAR}) {
    // barra de umbral: verde hacia la aproximación, roja hacia la pista
    col = along > 0.0 ? vec3(0.1, 1.0, 0.25) : vec3(1.0, 0.06, 0.04);
    I *= smoothstep(0.0, 0.25, abs(along));
  } else if (type == ${PAPI}) {
    float horiz = max(dot(toCam.xz, dir), 1e-4);
    float elev = atan(toCam.y, horiz);
    float k = smoothstep(-0.0009, 0.0009, elev - aDir.z);
    col = mix(vec3(1.0, 0.05, 0.03), vec3(1.0, 0.97, 0.9), k);
    I *= smoothstep(0.90, 0.985, along) * step(0.0, toCam.y);
  } else if (type == ${APPROACH}) {
    I *= smoothstep(0.15, 0.6, along);
  } else if (type == ${BEACON}) {
    float a = uParams.y * 2.6 + aDir.w;
    vec2 beam = vec2(cos(a), sin(a));
    float c = dot(th, beam);
    float f1 = pow(max(c, 0.0), 60.0), f2 = pow(max(-c, 0.0), 60.0);
    col = vec3(1.0, 1.0, 0.95) * f1 + vec3(0.1, 1.0, 0.3) * f2;
    I *= 1.0;
  } else if (type == ${BLINK}) {
    I *= 0.25 + 0.75 * step(0.5, fract(uParams.y * 0.55 + aDir.w));
  }
  // Tamaño en pantalla: como mínimo unos píxeles; el brillo se reparte en esa área.
  float pxPerM = uParams.z / d;
  float rpx = max(0.20 * pxPerM, 1.7);
  float omega = 3.14159 * rpx * rpx / (uParams.z * uParams.z) * 0.45;   // estereorradianes efectivos
  vec3 ins, tr;
  vec4 clip0 = uViewProj * vec4(rel, 1.0);
  aerialPerspective(clamp(clip0.xy / max(clip0.w, 1e-3) * 0.5 + 0.5, 0.0, 1.0), d, ins, tr);
  vec3 L = col * (I / (d * d)) / omega * uParams.x * uParams.w * tr;
  vCol = min(L, vec3(120.0));
  // halo mayor para las luces intensas
  float glare = 1.0 + 1.6 * clamp(log2(max(max(vCol.r, vCol.g), vCol.b) + 1.0) / 7.0, 0.0, 1.0);
  rpx *= glare;
  vCol /= glare * glare;
  // acercar un poco hacia la cámara para ganar la prueba de profundidad frente al suelo
  vec3 p = rel * (1.0 - min(0.012 + 1.5 / d, 0.5));
  vec4 clip = uViewProj * vec4(p, 1.0);
  clip.xy += aCorner * rpx * 2.0 / uViewport * clip.w;
  vUV = aCorner;
  gl_Position = clip;
  if (max(max(vCol.r, vCol.g), vCol.b) < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FS = `${GLSL_HEADER}
in vec2 vUV;
in vec3 vCol;
out vec4 o;
void main() {
  float r2 = dot(vUV, vUV);
  float a = exp(-r2 * 5.0) - 0.0067;
  if (a <= 0.0) discard;
  o = vec4(vCol * a, 1.0);
}`;

function buildLights(terrain) {
  const L = [];
  const add = (x, z, h, type, col, I, dir = [0, 0], par = 0, ph = 0) => {
    const y = Math.max(terrain.height(x, z), 0) + h;
    L.push(x, y, z, type, col[0], col[1], col[2], I, dir[0], dir[1], par, ph);
  };
  const WHITE = [1.0, 0.93, 0.78], YEL = [1.0, 0.72, 0.18], BLUE = [0.12, 0.3, 1.0], RED = [1, 0.06, 0.04];
  // Intensidades relativas (1 = iluminancia solar a 1 m): ~cd / 100000
  const EDGE = 0.045, APP = 0.08, TAXI = 0.0012, PAPI_I = 0.25;
  for (const a of AIRPORTS) {
    const hl = a.length / 2, hw = a.width / 2;
    if (a.lights) {
      // bordes de pista cada 60 m (ámbar en los últimos 600 m no se distingue por sentido: blanco)
      for (let s = -hl; s <= hl + 1; s += 60) {
        for (const side of [-1, 1]) {
          const [x, z] = runwayPoint(a, s, side * (hw + 1.5));
          const end = Math.min(hl - Math.abs(s), 1e9) < 0;
          add(x, z, 0.35, OMNI, Math.abs(s) > hl - 300 && a.main ? YEL : WHITE, EDGE);
          void end;
        }
      }
      // umbrales y finales (barra)
      for (const e of [0, 1]) {
        const s = e === 0 ? -hl : hl;
        const out = e === 0 ? [-a.dir[0], -a.dir[1]] : [a.dir[0], a.dir[1]];   // hacia la aproximación
        for (let w = -hw; w <= hw + 0.1; w += hw / 5) {
          const [x, z] = runwayPoint(a, s, w);
          add(x, z, 0.3, BAR, [1, 1, 1], EDGE * 1.6, out);
        }
        // luces de aproximación: línea central y barra transversal
        const n = a.main ? 14 : 5;
        for (let i = 1; i <= n; i++) {
          const [x, z] = runwayPoint(a, s + (e === 0 ? -1 : 1) * i * 30, 0);
          add(x, z, 0.6 + i * 0.12, APPROACH, WHITE, APP, out);
        }
        if (a.main) for (let w = -12; w <= 12; w += 4) {
          if (w === 0) continue;
          const [x, z] = runwayPoint(a, s + (e === 0 ? -1 : 1) * 300, w);
          add(x, z, 1.8, APPROACH, WHITE, APP, out);
        }
        // PAPI: a la izquierda de la pista (según se aproxima), junto al punto de visada
        const aim = a.main ? 300 : 180;
        const leftSign = e === 0 ? -1 : 1;
        const angles = [3.5, 3.17, 2.83, 2.5];
        for (let k = 0; k < 4; k++) {
          const [x, z] = runwayPoint(a, s + (e === 0 ? 1 : -1) * aim, leftSign * (hw + 14 + k * 8));
          add(x, z, 0.7, PAPI, [1, 1, 1], PAPI_I, out, angles[k] * DEG);
        }
      }
      // rodajes: borde azul
      for (const r of a.paved) {
        const [ca, cc, ha, hc, ty] = r;
        if (ty === PAVED.APRON) {
          for (const [da, dc] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1]]) {
            const [x, z] = runwayPoint(a, ca + da * ha, cc + dc * hc);
            add(x, z, 9, OMNI, [1.0, 0.86, 0.6], 0.03);          // focos de plataforma
          }
          continue;
        }
        const alongAxis = ty === PAVED.TAXI_ALONG;
        const len = alongAxis ? ha : hc, wid = alongAxis ? hc : ha;
        for (let s = -len; s <= len + 0.1; s += 30) {
          for (const side of [-1, 1]) {
            const al = alongAxis ? ca + s : ca + side * (wid + 1), ac = alongAxis ? cc + side * (wid + 1) : cc + s;
            if (Math.abs(ac) < hw + 3) continue;
            const [x, z] = runwayPoint(a, al, ac);
            add(x, z, 0.3, OMNI, BLUE, TAXI);
          }
        }
      }
    }
    // baliza giratoria y luz de obstáculo junto a la plataforma
    const ap = a.apron;
    const [bx, bz] = runwayPoint(a, ap.along + ap.halfAlong * 0.55, ap.across + Math.sign(ap.across) * (ap.halfAcross + 16));
    add(bx, bz, a.main ? 26 : 9, BEACON, [1, 1, 1], a.lights ? 0.9 : 0.25, [1, 0], 0, a.x * 0.01);
    add(bx, bz, a.main ? 24.5 : 8, BLINK, RED, 0.006, [0, 0], 0, 0.3);
  }
  return new Float32Array(L);
}

export class AirportLights {
  constructor(gl, terrainData) {
    this.gl = gl;
    const data = buildLights(terrainData);
    this.count = data.length / 12;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 48, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    this.prog = new Program(gl, VS, FS, 'lights');
    this.scale = 1;
  }

  render(ctx) {
    const { cam, env, atmosphere, viewport, exposure } = ctx;
    const gl = this.gl, p = this.prog.use();
    atmosphere.bind(p, viewport);
    p.set('uViewProj', cam.viewProj).set('uCamPos', cam.pos[0], cam.pos[1], cam.pos[2]);
    p.set('uParams', exposure, env.time, viewport[1] / (2 * Math.tan(cam.fovY / 2)), this.scale);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
    gl.bindVertexArray(null);
  }
}
