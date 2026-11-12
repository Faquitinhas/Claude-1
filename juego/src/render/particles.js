// Partículas sencillas (humo de neumáticos en la toma, polvo al rodar por tierra, salpicaduras
// y el humo de un accidente): billboards blandos simulados en CPU e instanciados.
import { GLSL_HEADER, Program } from '../core/gl.js';
import { GLSL_ATMO_SCENE } from '../world/atmosphere.js';

const MAX = 320;

const VS = `${GLSL_HEADER}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPos;    // xyz relativo a cámara, w tamaño
layout(location = 2) in vec4 aCol;    // rgb albedo, a opacidad
uniform mat4 uViewProj;
uniform vec3 uRight, uUp;
out vec2 vUV; out vec4 vCol; out vec3 vRel;
void main() {
  vec3 p = aPos.xyz + (uRight * aCorner.x + uUp * aCorner.y) * aPos.w;
  vUV = aCorner; vCol = aCol; vRel = p;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;
const FS = `${GLSL_HEADER}
${GLSL_ATMO_SCENE}
uniform float uCamAlt;
in vec2 vUV; in vec4 vCol; in vec3 vRel;
out vec4 o;
void main() {
  float r2 = dot(vUV, vUV);
  float a = vCol.a * smoothstep(1.0, 0.15, r2);
  if (a < 0.003) discard;
  // iluminación difusa aproximada de un medio poco denso
  vec3 E = uSunE * lightTransmittance(uCamAlt + vRel.y, uSunDir.y) * (0.35 + 0.25 * max(uSunDir.y, 0.0)) + skyIrradiance(vec3(0.0, 1.0, 0.0)) * 0.6
         + uMoonE * 0.4;
  vec3 col = vCol.rgb / PI * E * (0.85 + 0.15 * (1.0 - vUV.y));
  o = vec4(applyAP(col, vRel), a);
}`;

export class Particles {
  constructor(gl) {
    this.gl = gl;
    this.p = [];
    this.data = new Float32Array(MAX * 8);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 2; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 32, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    this.prog = new Program(gl, VS, FS, 'particles');
  }

  // Emite n partículas. o: {pos, vel, spread, size, grow, life, color, alpha, rise}
  emit(n, o) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= MAX) this.p.shift();
      const s = o.spread || 0.3, r = () => (Math.random() - 0.5) * 2;
      this.p.push({
        x: o.pos[0] + r() * s, y: o.pos[1] + Math.abs(r()) * s * 0.5, z: o.pos[2] + r() * s,
        vx: (o.vel ? o.vel[0] : 0) + r() * (o.jitter || 0.6), vy: (o.vel ? o.vel[1] : 0) + (o.rise || 0.4) * (0.5 + Math.random()), vz: (o.vel ? o.vel[2] : 0) + r() * (o.jitter || 0.6),
        size: (o.size || 0.4) * (0.7 + 0.6 * Math.random()), grow: o.grow || 1.5, life: (o.life || 1.5) * (0.7 + 0.6 * Math.random()), t: 0,
        col: o.color || [0.8, 0.8, 0.8], alpha: o.alpha || 0.35, drag: o.drag ?? 1.6,
      });
    }
  }

  update(dt, wind) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) { P.splice(i, 1); continue; }
      const k = Math.exp(-q.drag * dt);
      q.vx = wind[0] + (q.vx - wind[0]) * k; q.vz = wind[2] + (q.vz - wind[2]) * k; q.vy *= Math.exp(-0.6 * dt);
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.size += q.grow * dt;
    }
  }

  render(ctx) {
    const P = this.p;
    if (!P.length) return;
    const { cam, atmosphere, viewport } = ctx;
    const gl = this.gl, d = this.data;
    // de lejos a cerca
    P.sort((a, b) => ((b.x - cam.pos[0]) ** 2 + (b.y - cam.pos[1]) ** 2 + (b.z - cam.pos[2]) ** 2) - ((a.x - cam.pos[0]) ** 2 + (a.y - cam.pos[1]) ** 2 + (a.z - cam.pos[2]) ** 2));
    let n = 0;
    for (const q of P) {
      const f = q.t / q.life;
      const a = q.alpha * Math.min(f * 8, 1) * (1 - f) * (1 - f);
      d.set([q.x - cam.pos[0], q.y - cam.pos[1], q.z - cam.pos[2], q.size, q.col[0], q.col[1], q.col[2], a], n * 8);
      n++;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, n * 8));
    const p = this.prog.use();
    atmosphere.bind(p, viewport);
    p.set('uViewProj', cam.viewProj).set('uRight', cam.right).set('uUp', cam.up).set('uCamAlt', cam.pos[1]);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
    gl.bindVertexArray(null);
  }
}
