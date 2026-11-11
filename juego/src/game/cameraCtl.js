// Cámaras del juego: persecución (orbitable), cabina, sobrevuelo fijo ("torre") y libre.
import { clamp, damp, quat, DEG } from '../core/math.js';
import { lookDir } from '../render/camera.js';
import { qrot, SPEC } from '../aircraft/fdm.js';

export const CAM_MODES = ['chase', 'cockpit', 'flyby'];
export const CAM_NAMES = { chase: 'Exterior', cockpit: 'Cabina', flyby: 'Sobrevuelo', free: 'Libre' };

export class CameraController {
  constructor() {
    this.mode = 'chase';
    this.orbitYaw = 0;       // desplazamiento del usuario (rad)
    this.orbitPitch = 0;
    this.dist = 13;
    this.lookYaw = 0; this.lookPitch = -8 * DEG;   // mirada en cabina
    this.heading = null;     // rumbo suavizado de la cámara de persecución
    this.flyPos = null;
    this.flyT = 0;
    this.free = { pos: [0, 500, 0], yaw: 0, pitch: 0, fov: 55 };
    this.shake = 0;
    this.headOff = [0, 0, 0];
    this.fovCockpit = 62;
  }

  next() {
    const i = CAM_MODES.indexOf(this.mode);
    this.mode = CAM_MODES[(i + 1) % CAM_MODES.length];
    this.flyPos = null;
    return this.mode;
  }

  drag(dx, dy) {
    if (this.mode === 'cockpit') {
      this.lookYaw = clamp(this.lookYaw - dx * 0.004, -2.6, 2.6);
      this.lookPitch = clamp(this.lookPitch - dy * 0.004, -1.2, 1.3);
    } else {
      this.orbitYaw -= dx * 0.005;
      this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, -1.3, 1.2);
    }
  }
  zoom(f) {
    if (this.mode === 'cockpit') this.fovCockpit = clamp(this.fovCockpit * f, 35, 95);
    else this.dist = clamp(this.dist * f, 7, 120);
  }
  resetView() { this.orbitYaw = 0; this.orbitPitch = 0; this.lookYaw = 0; this.lookPitch = -8 * DEG; this.dist = 13; this.fovCockpit = 62; }

  update(cam, ac, dt, terrain) {
    const p = ac.pos;
    cam.useBasis = false;
    if (this.mode === 'free') {
      const f = this.free;
      cam.pos = [f.pos[0], f.pos[1], f.pos[2]];
      quat.fromHPR(cam.q, f.yaw * DEG, f.pitch * DEG, 0);
      cam.fovY = f.fov * DEG;
      return;
    }
    const fwd = qrot(ac.q, [0, 0, -1]);
    const up = qrot(ac.q, [0, 1, 0]);
    if (this.mode === 'cockpit') {
      const e = SPEC.eye;
      // pequeño movimiento de cabeza con las aceleraciones
      const ba = ac.tel.bodyAcc;
      const tx = clamp(-ba[0] * 0.004, -0.04, 0.04), ty = clamp(-(ba[1] - 9.8) * 0.0035, -0.05, 0.04), tz = clamp(-ba[2] * 0.004, -0.05, 0.05);
      this.headOff[0] = damp(this.headOff[0], tx, 6, dt); this.headOff[1] = damp(this.headOff[1], ty, 6, dt); this.headOff[2] = damp(this.headOff[2], tz, 6, dt);
      // vibración del motor y de la rodadura (milímetros)
      this.vt = (this.vt || 0) + dt;
      const rpmK = Math.min(ac.engine.rpm / 2700, 1) * 0.0011;
      const rollK = ac.tel.onGround ? Math.min(ac.tel.groundSpeed / 30, 1) * (ac.gear[1].surface === 'asphalt' ? 0.0016 : 0.006) : 0;
      const buff = ac.tel.stall > 0.9 && !ac.tel.onGround ? 0.004 : 0;
      const vb = rpmK + rollK + buff;
      const sx = Math.sin(this.vt * 97) * Math.sin(this.vt * 31.7) * vb, sy = Math.sin(this.vt * 113 + 1.3) * Math.sin(this.vt * 27.1) * vb * 1.4;
      const eye = qrot(ac.q, [e[0] + this.headOff[0] + sx, e[1] + this.headOff[1] + sy, e[2] + this.headOff[2]]);
      cam.pos = [p[0] + eye[0], p[1] + eye[1], p[2] + eye[2]];
      const ql = quat.fromHPR([0, 0, 0, 1], -this.lookYaw, this.lookPitch, 0);
      quat.mul(cam.q, ac.q, ql);
      cam.fovY = this.fovCockpit * DEG;
      return;
    }
    if (this.mode === 'flyby') {
      this.flyT -= dt;
      const sp = Math.hypot(ac.vel[0], ac.vel[1], ac.vel[2]);
      const far = this.flyPos ? Math.hypot(this.flyPos[0] - p[0], this.flyPos[1] - p[1], this.flyPos[2] - p[2]) : 1e9;
      if (!this.flyPos || far > Math.max(450, sp * 9) || this.flyT < -40) {
        const lead = Math.max(sp * 4.5, 35);
        const side = Math.random() < 0.5 ? -1 : 1;
        const vn = sp > 3 ? [ac.vel[0] / sp, ac.vel[1] / sp, ac.vel[2] / sp] : fwd;
        const r = [-vn[2], 0, vn[0]];
        let x = p[0] + vn[0] * lead + r[0] * side * (18 + Math.random() * 25);
        let z = p[2] + vn[2] * lead + r[2] * side * (18 + Math.random() * 25);
        let y = p[1] + vn[1] * lead - 6 + Math.random() * 8;
        const g = Math.max(terrain.height(x, z), 0);
        y = Math.max(y, g + 1.7);
        if (ac.tel.agl < 25) y = g + 1.7 + Math.random() * 2.5;
        this.flyPos = [x, y, z];
        this.flyT = 0;
      }
      cam.pos = [this.flyPos[0], this.flyPos[1], this.flyPos[2]];
      const d = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
      const dist = Math.hypot(d[0], d[1], d[2]);
      lookDir(cam, d);
      cam.fovY = clamp(2 * Math.atan(16 / Math.max(dist, 10)), 7 * DEG, 55 * DEG);
      return;
    }
    // --- persecución ---
    const hdg = Math.atan2(fwd[0], -fwd[2]);
    if (this.heading === null) this.heading = hdg;
    let dh = hdg - this.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    this.heading += dh * (1 - Math.exp(-dt * 3.2));
    const yaw = this.heading + this.orbitYaw;
    // la cámara sigue parcialmente el cabeceo
    const pitchAc = Math.asin(clamp(fwd[1], -1, 1));
    const el = clamp(11 * DEG + this.orbitPitch - pitchAc * 0.35, -1.4, 1.45);
    const ce = Math.cos(el), se = Math.sin(el);
    const back = [-Math.sin(yaw) * ce, se, Math.cos(yaw) * ce];
    const tgt = [p[0] + up[0] * 0.6, p[1] + up[1] * 0.6, p[2] + up[2] * 0.6];
    let cx = tgt[0] + back[0] * this.dist, cy = tgt[1] + back[1] * this.dist, cz = tgt[2] + back[2] * this.dist;
    const g = Math.max(terrain.height(cx, cz), 0) + 1.3;
    if (cy < g) cy = g;
    cam.pos = [cx, cy, cz];
    const look = [tgt[0] + fwd[0] * 2.5 - cx, tgt[1] + fwd[1] * 2.5 - cy, tgt[2] + fwd[2] * 2.5 - cz];
    // ligera inclinación con el alabeo del avión
    const roll = ac.tel.roll * 0.12;
    lookDir(cam, look, [Math.sin(roll) * Math.cos(yaw), Math.cos(roll), Math.sin(roll) * Math.sin(yaw)]);
    cam.fovY = 55 * DEG;
  }
}
