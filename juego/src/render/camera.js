// Cámara con render relativo a la propia cámara (la vista no lleva traslación).
import { m4, quat } from '../core/math.js';

export function createCamera() {
  return {
    pos: [0, 100, 0], q: [0, 0, 0, 1], fovY: (55 * Math.PI) / 180, near: 1, far: 450000, aspect: 16 / 9,
    view: m4.create(), proj: m4.create(), viewProj: m4.create(),
    right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1],
    rays: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  };
}

export function updateCamera(cam) {
  quat.rotate(cam.right, cam.q, [1, 0, 0]);
  quat.rotate(cam.up, cam.q, [0, 1, 0]);
  quat.rotate(cam.fwd, cam.q, [0, 0, -1]);
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

// Proyecta un punto del mundo a coordenadas de pantalla normalizadas [0,1]; devuelve null si queda detrás.
export function projectPoint(cam, p) {
  const r = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
  const m = cam.viewProj;
  const w = m[3] * r[0] + m[7] * r[1] + m[11] * r[2] + m[15];
  if (w <= 0.001) return null;
  const x = (m[0] * r[0] + m[4] * r[1] + m[8] * r[2] + m[12]) / w;
  const y = (m[1] * r[0] + m[5] * r[1] + m[9] * r[2] + m[13]) / w;
  return [x * 0.5 + 0.5, 0.5 - y * 0.5, w];
}
