// Lluvia: trazos instanciados sin estado dentro de una caja que acompaña a la cámara.
// La dirección de cada trazo sale de la velocidad de caída relativa a la cámara, así que en
// vuelo la lluvia viene de frente y en tierra cae casi vertical.
import { GLSL_HEADER, Program } from '../core/gl.js';
import { GLSL_ATMO_SCENE } from '../world/atmosphere.js';
import { GLSL_HASH } from '../world/glslNoise.js';

const COUNT = 3600;

const VS = `${GLSL_HEADER}
${GLSL_HASH}
layout(location = 0) in vec2 aCorner;   // x: lado (-1, 1), y: extremo (0, 1)
uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec3 uFall;      // velocidad de la gota (mundo)
uniform vec3 uRelVel;    // velocidad de la gota respecto a la cámara
uniform vec4 uP;         // x: tiempo, y: tamaño de la caja, z: intensidad, w: nº de gotas activas
out float vA; out vec3 vRel; out float vSide;
void main() {
  float id = float(gl_InstanceID);
  vec3 h = hash33(vec3(id, id * 0.37 + 3.0, 11.0));
  float B = uP.y;
  vec3 q = h * B + uFall * uP.x;
  vec3 rel = mod(q - uCamPos, B) - B * 0.5;
  float sp = length(uRelVel);
  vec3 d = uRelVel / max(sp, 0.01);
  float len = clamp(sp * 0.022, 0.12, 1.6) * (0.7 + 0.6 * h.x);
  vec3 p = rel + d * (aCorner.y - 0.5) * len;
  float dist = length(p);
  vec3 side = normalize(cross(d, p));
  p += side * aCorner.x * max(0.0035, dist * 0.0011);
  vRel = p; vSide = aCorner.x;
  vA = step(id, uP.w) * smoothstep(0.5, 1.6, dist) * (1.0 - smoothstep(B * 0.36, B * 0.5, dist)) * (0.5 + 0.5 * h.y);
  gl_Position = uViewProj * vec4(p, 1.0);
}`;
const FS = `${GLSL_HEADER}
${GLSL_ATMO_SCENE}
in float vA; in vec3 vRel; in float vSide;
out vec4 o;
void main() {
  float a = vA * (1.0 - vSide * vSide) * 0.34;
  if (a < 0.004) discard;
  // la gota refracta el cielo: se ve del color de la luz ambiente, algo más clara
  vec3 col = (skyIrradiance(vec3(0.0, 1.0, 0.0)) * 0.75 + uSunE * 0.02 + uMoonE * 0.3) / PI;
  o = vec4(applyAP(col, vRel), a);
}`;

export class Rain {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.prog = new Program(gl, VS, FS, 'rain');
    this.last = null;
    this.camVel = [0, 0, 0];
  }

  render(ctx) {
    const { cam, env, atmosphere, viewport, dt } = ctx;
    // velocidad de la cámara (suavizada) a partir de su desplazamiento
    if (this.last && dt > 0) {
      for (let i = 0; i < 3; i++) {
        const v = (cam.pos[i] - this.last[i]) / dt;
        this.camVel[i] += (Math.abs(v) < 150 ? v - this.camVel[i] : -this.camVel[i]) * Math.min(1, dt * 6);
      }
    }
    this.last = [cam.pos[0], cam.pos[1], cam.pos[2]];
    const r = env.rain || 0;
    if (r <= 0.01 || cam.pos[1] > env.clouds.base + 200) return;
    const gl = this.gl;
    const to = ((env.wind.dir + 180) * Math.PI) / 180;
    const fall = [Math.sin(to) * env.wind.speed, -8.5, -Math.cos(to) * env.wind.speed];
    const rel = [fall[0] - this.camVel[0], fall[1] - this.camVel[1], fall[2] - this.camVel[2]];
    const p = this.prog.use();
    atmosphere.bind(p, viewport);
    p.set('uViewProj', cam.viewProj).set('uCamPos', cam.pos).set('uFall', fall).set('uRelVel', rel)
      .set('uP', env.time % 1000, 26, r, Math.round(COUNT * Math.min(1, 0.25 + r)));
    gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, COUNT);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
    gl.bindVertexArray(null);
  }
}
