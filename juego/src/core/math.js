// Utilidades matemáticas mínimas (vectores como arrays, matrices 4x4 column-major).
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const saturate = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const sign = (x) => (x < 0 ? -1 : x > 0 ? 1 : 0);
export const wrapAngle = (a) => {
  a = (a + PI) % TAU;
  if (a < 0) a += TAU;
  return a - PI;
};
// Suavizado exponencial independiente del framerate.
export const damp = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);

// ---------- vec3 ----------
export const v3 = {
  create: (x = 0, y = 0, z = 0) => [x, y, z],
  set: (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; },
  copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
  add: (o, a, b) => { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  sub: (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  scale: (o, a, s) => { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  addScaled: (o, a, b, s) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (o, a, b) => {
    const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  },
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  normalize: (o, a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
  },
  lerp: (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; },
};

// ---------- cuaterniones [x,y,z,w] ----------
export const quat = {
  create: () => [0, 0, 0, 1],
  copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; },
  fromAxisAngle: (o, ax, ang) => {
    const s = Math.sin(ang * 0.5);
    o[0] = ax[0] * s; o[1] = ax[1] * s; o[2] = ax[2] * s; o[3] = Math.cos(ang * 0.5); return o;
  },
  mul: (o, a, b) => {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
    o[0] = aw * bx + ax * bw + ay * bz - az * by;
    o[1] = aw * by - ax * bz + ay * bw + az * bx;
    o[2] = aw * bz + ax * by - ay * bx + az * bw;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
  },
  conj: (o, a) => { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = a[3]; return o; },
  normalize: (o, a) => {
    const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; o[3] = a[3] / l; return o;
  },
  // Rota el vector v por el cuaternión q.
  rotate: (o, q, v) => {
    const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    o[0] = x + qw * tx + (qy * tz - qz * ty);
    o[1] = y + qw * ty + (qz * tx - qx * tz);
    o[2] = z + qw * tz + (qx * ty - qy * tx);
    return o;
  },
  // Rota por el inverso (mundo -> cuerpo).
  rotateInv: (o, q, v) => {
    const x = v[0], y = v[1], z = v[2], qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    o[0] = x + qw * tx + (qy * tz - qz * ty);
    o[1] = y + qw * ty + (qz * tx - qx * tz);
    o[2] = z + qw * tz + (qx * ty - qy * tx);
    return o;
  },
  // Orientación a partir de rumbo (0 = norte = -Z, horario), cabeceo (+ nariz arriba) y alabeo (+ ala derecha abajo).
  fromHPR: (o, heading, pitch, roll) => {
    const qh = quat.fromAxisAngle([0, 0, 0, 1], [0, 1, 0], -heading);
    const qp = quat.fromAxisAngle([0, 0, 0, 1], [1, 0, 0], pitch);
    const qr = quat.fromAxisAngle([0, 0, 0, 1], [0, 0, 1], -roll);
    quat.mul(o, qh, qp);
    quat.mul(o, o, qr);
    return o;
  },
  slerp: (o, a, b, t) => {
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0, s1;
    if (1 - c > 1e-6) {
      const om = Math.acos(c), sn = Math.sin(om);
      s0 = Math.sin((1 - t) * om) / sn; s1 = Math.sin(t * om) / sn;
    } else { s0 = 1 - t; s1 = t; }
    o[0] = s0 * a[0] + s1 * bx; o[1] = s0 * a[1] + s1 * by; o[2] = s0 * a[2] + s1 * bz; o[3] = s0 * a[3] + s1 * bw;
    return o;
  },
};

// ---------- mat4 (column-major, Float32Array o Array de 16) ----------
export const m4 = {
  create: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity: (m) => { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  copy: (o, a) => { for (let i = 0; i < 16; i++) o[i] = a[i]; return o; },
  mul: (o, a, b) => {
    const r = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let rr = 0; rr < 4; rr++) {
        r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
      }
    }
    for (let i = 0; i < 16; i++) o[i] = r[i];
    return o;
  },
  perspective: (o, fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) / (near - far); o[11] = -1; o[14] = (2 * far * near) / (near - far);
    return o;
  },
  ortho: (o, l, r, b, t, n, f) => {
    o.fill(0);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  },
  // Matriz de rotación a partir de cuaternión (+ traslación opcional).
  fromQuatPos: (o, q, p) => {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    o[0] = 1 - (yy + zz); o[1] = xy + wz; o[2] = xz - wy; o[3] = 0;
    o[4] = xy - wz; o[5] = 1 - (xx + zz); o[6] = yz + wx; o[7] = 0;
    o[8] = xz + wy; o[9] = yz - wx; o[10] = 1 - (xx + yy); o[11] = 0;
    o[12] = p ? p[0] : 0; o[13] = p ? p[1] : 0; o[14] = p ? p[2] : 0; o[15] = 1;
    return o;
  },
  // Vista a partir de la base de la cámara (right, up, back = -forward), sin traslación (render relativo a cámara).
  viewFromBasis: (o, r, u, b) => {
    o[0] = r[0]; o[4] = r[1]; o[8] = r[2]; o[12] = 0;
    o[1] = u[0]; o[5] = u[1]; o[9] = u[2]; o[13] = 0;
    o[2] = b[0]; o[6] = b[1]; o[10] = b[2]; o[14] = 0;
    o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
    return o;
  },
  translate: (o, x, y, z) => { m4.identity(o); o[12] = x; o[13] = y; o[14] = z; return o; },
  scaling: (o, x, y, z) => { m4.identity(o); o[0] = x; o[5] = y; o[10] = z; return o; },
  invert: (o, a) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  transformPoint: (o, m, p) => {
    const x = p[0], y = p[1], z = p[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    o[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    o[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    o[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return o;
  },
  transformDir: (o, m, d) => {
    const x = d[0], y = d[1], z = d[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z;
    o[1] = m[1] * x + m[5] * y + m[9] * z;
    o[2] = m[2] * x + m[6] * y + m[10] * z;
    return o;
  },
};

// Generador pseudoaleatorio determinista (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
