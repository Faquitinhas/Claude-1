// Cámara con render relativo a la propia cámara (la vista no lleva traslación).
import { m4, quat } from '../core/math.js';

export function createCamera() {
  return {
    pos: [0, 100, 0], q: [0, 0, 0, 1], fovY: (55 * Math.PI) / 180, near: 1, far: 450000, aspect: 16 / 9,
    view: m4.create(), proj: m4.create(), viewProj: m4.create(),
    right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1],
    rays: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
    useBasis: false,
  };
}

// Orienta la cámara mirando en 'fwd' con la vertical aproximada 'upHint'.
export function lookDir(cam, fwd, upHint = [0, 1, 0]) {
  const fl = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1;
  const f = [fwd[0] / fl, fwd[1] / fl, fwd[2] / fl];
  let r = [f[1] * upHint[2] - f[2] * upHint[1], f[2] * upHint[0] - f[0] * upHint[2], f[0] * upHint[1] - f[1] * upHint[0]];
  let rl = Math.hypot(r[0], r[1], r[2]);
  if (rl < 1e-5) { r = [1, 0, 0]; rl = 1; }
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  cam.fwd = f; cam.right = r; cam.up = u;
  cam.useBasis = true;
}

export function updateCamera(cam) {
  if (!cam.useBasis) {
    quat.rotate(cam.right, cam.q, [1, 0, 0]);
    quat.rotate(cam.up, cam.q, [0, 1, 0]);
    quat.rotate(cam.fwd, cam.q, [0, 0, -1]);
  }
  const back = [-cam.fwd[0], -cam.fwd[1], -cam.fwd[2]];
  m4.viewFromBasis(cam.view, cam.right, cam.up, back);
  m4.perspective(cam.proj, cam.fovY, cam.aspect, cam.near, cam.far);
  m4.mul(cam.viewProj, cam.proj, cam.view);
  const ty = Math.tan(cam.fovY / 2), tx = ty * cam.aspect;
  const c = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 3; k++) cam.rays[i][k] = cam.fwd[k] + c[i][0] * tx * cam.right[k] + c[i][1] * ty * cam.up[k];
  }
  return cam;
}

// Proyecta un punto del mundo a coordenadas de pantalla normalizadas [0,1]; null si queda detrás.
export function projectPoint(cam, p) {
  const r = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
  const m = cam.viewProj;
  const w = m[3] * r[0] + m[7] * r[1] + m[11] * r[2] + m[15];
  if (w <= 0.001) return null;
  const x = (m[0] * r[0] + m[4] * r[1] + m[8] * r[2] + m[12]) / w;
  const y = (m[1] * r[0] + m[5] * r[1] + m[9] * r[2] + m[13]) / w;
  return [x * 0.5 + 0.5, 0.5 - y * 0.5, w];
}
