// Dinámica de vuelo de 6 grados de libertad para un monomotor ligero de ala alta
// (clase entrenador de 4 plazas, 160 hp).
//
// El avión se modela como un sólido rígido sobre el que actúan elementos aerodinámicos
// independientes (tiras de ala, estabilizador, deriva, fuselaje). Cada elemento calcula su
// propio ángulo de ataque a partir de la velocidad local del aire (incluye la rotación del
// avión, la estela de la hélice, la deflexión de la estela del ala y las ráfagas) y usa
// curvas de sustentación/resistencia válidas en todo el rango de ±180° (modelo de Khan y
// Nahon, 2015). Así la pérdida, la caída de ala, la barrena, la guiñada adversa, el
// amortiguamiento de alabeo o el efecto suelo no se programan: emergen.
//
// Ejes cuerpo: +X ala derecha, +Y arriba, +Z cola (el morro apunta a -Z).
// Ejes mundo:  +X este, +Y arriba, +Z sur.
import { clamp, lerp } from '../core/math.js';

export const G0 = 9.80665;
export const KT = 0.514444;      // m/s por nudo
export const FT = 0.3048;        // m por pie
const DEG = Math.PI / 180;

// Atmósfera estándar internacional (troposfera).
export function isa(alt, out) {
  const h = alt < -500 ? -500 : alt > 11000 ? 11000 : alt;
  const T = 288.15 - 0.0065 * h;
  const p = 101325 * Math.pow(T / 288.15, 5.25588);
  out.T = T; out.p = p; out.rho = p / (287.053 * T); out.a = Math.sqrt(401.874 * T);
  return out;
}

// ---------------- parámetros del avión ----------------
export const SPEC = {
  name: 'Cóndor C-160',
  mass: 1043,                 // kg (con piloto y combustible)
  emptyMass: 767,
  inertia: [1825, 2667, 1285], // Ixx (cabeceo), Iyy (guiñada), Izz (alabeo) kg·m²
  wingArea: 16.2, wingSpan: 11.0, mac: 1.49,
  propDiameter: 1.905, propInertia: 2.1,
  ratedPower: 119300, ratedRPM: 2700,
  fuelCapacity: 120,          // kg utilizables (~43 gal)
  vne: 163, vno: 129, va: 99, vfe: 85, vs0: 41, vs1: 48, vr: 55, vx: 62, vy: 74, // nudos
  gLimitPos: 3.8, gLimitNeg: -1.52,
  eye: [-0.24, 0.43, -0.10],   // posición del ojo del piloto (cuerpo)
};

function rotZ(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

function buildSurfaces() {
  const S = [];
  const AR = 7.47, dihedral = 1.73 * DEG;
  const wingY = 0.86, wingZ = -0.06;
  const strips = [
    { x: 0.0, w: 1.0, c: 1.63, inc: 1.5, ctl: 'none', wash: 0.5, root: 1 },
    { x: 1.2, w: 1.4, c: 1.63, inc: 1.3, ctl: 'flap', wash: 0.25, root: 1 },
    { x: 2.6, w: 1.4, c: 1.6, inc: 0.6, ctl: 'flap', wash: 0, root: 0.5 },
    { x: 3.85, w: 1.1, c: 1.42, inc: -0.4, ctl: 'ail', wash: 0, root: 0 },
    { x: 4.95, w: 1.1, c: 1.2, inc: -1.2, ctl: 'ail', wash: 0, root: 0 },
  ];
  for (const st of strips) {
    for (const side of st.x === 0 ? [0] : [1, -1]) {
      const inc = st.inc * DEG;
      const roll = side * dihedral; // el ala derecha sube
      const fwd = rotZ([0, Math.sin(inc), -Math.cos(inc)], roll);
      const nrm = rotZ([0, Math.cos(inc), Math.sin(inc)], roll);
      S.push({
        name: `ala${side > 0 ? 'D' : side < 0 ? 'I' : 'C'}${st.x}`, group: 'wing', side,
        pos: [side * st.x, wingY + Math.abs(st.x) * Math.tan(dihedral), wingZ],
        area: st.w * st.c, chord: st.c, fwd, nrm, span: cross(fwd, nrm),
        AR, alpha0: -2.1 * DEG, stallHi: 17.0 * DEG, stallLo: -13 * DEG, cf: 0.0082, cm0: -0.045,
        e: 0.78, clMinD: 0.25, kProfile: 0.0085,
        ctl: st.ctl, flapFrac: st.ctl === 'flap' ? 0.28 : st.ctl === 'ail' ? 0.22 : 0, flapGain: st.ctl === 'flap' ? 1.3 : 1,
        wash: st.wash, root: st.root, dw: 0, qf: 1,
      });
    }
  }
  // Estabilizador horizontal (dos mitades) con timón de profundidad.
  const incH = -1.9 * DEG;
  for (const side of [1, -1]) {
    const fwd = [0, Math.sin(incH), -Math.cos(incH)], nrm = [0, Math.cos(incH), Math.sin(incH)];
    S.push({
      name: `estab${side > 0 ? 'D' : 'I'}`, group: 'htail', side, pos: [side * 0.86, 0.12, 4.38],
      area: 1.675, chord: 0.98, fwd, nrm, span: cross(fwd, nrm),
      AR: 3.55, alpha0: 0, stallHi: 14 * DEG, stallLo: -14 * DEG, cf: 0.0095, cm0: 0,
      e: 0.85, clMinD: 0, kProfile: 0.01,
      ctl: 'elev', flapFrac: 0.42, flapGain: 1, wash: 0.45, root: 0, dw: 1, qf: 0.92,
    });
  }
  // Deriva con timón de dirección. Normal hacia +X.
  {
    const fwd = [0, 0, -1], nrm = [1, 0, 0];
    S.push({
      name: 'deriva', group: 'vtail', side: 0, pos: [0, 0.98, 4.55],
      area: 1.72, chord: 1.12, fwd, nrm, span: cross(fwd, nrm),
      AR: 1.95, alpha0: 0, stallHi: 16 * DEG, stallLo: -16 * DEG, cf: 0.0095, cm0: 0,
      e: 0.85, clMinD: 0, kProfile: 0.01,
      ctl: 'rud', flapFrac: 0.4, flapGain: 1, wash: 0.7, root: 0, dw: 0, qf: 0.95,
    });
  }
  return S;
}

// Cuerpos romos: resistencia cuadrática anisótropa. A = [CdA lateral, CdA vertical, CdA frontal] (m²)
const BODIES = [
  { pos: [0, 0.0, -1.25], A: [0.75, 0.8, 0.105] },   // capó y parabrisas
  { pos: [0, 0.05, 0.4], A: [1.1, 1.2, 0.07] },      // cabina
  { pos: [0, 0.15, 2.9], A: [0.75, 0.7, 0.03] },     // cono de cola
  { pos: [0, -0.92, 0.05], A: [0.12, 0.05, 0.088] }, // tren fijo
  { pos: [0, 0.25, -0.1], A: [0.03, 0.02, 0.03] },   // montantes del ala
];

// Tren triciclo. pos = punto de contacto con el amortiguador extendido.
const GEAR = [
  { name: 'morro', pos: [0, -1.19, -1.22], k: 46000, c: 3600, steer: true, brake: false, radius: 0.18, maxLoad: 15500 },
  { name: 'izq', pos: [-1.27, -1.19, 0.44], k: 56000, c: 2900, steer: false, brake: true, radius: 0.21, maxLoad: 22000, side: -1 },
  { name: 'der', pos: [1.27, -1.19, 0.44], k: 56000, c: 2900, steer: false, brake: true, radius: 0.21, maxLoad: 22000, side: 1 },
];
const GEAR_TRAVEL = 0.26;

// Puntos duros de la célula (para detectar golpes con el suelo).
const HARD = [
  { name: 'hélice', pos: [0, -1.0, -1.92], kind: 'prop' },
  { name: 'morro', pos: [0, -0.35, -2.1], kind: 'body' },
  { name: 'punta de ala derecha', pos: [5.5, 1.0, -0.1], kind: 'wing' },
  { name: 'punta de ala izquierda', pos: [-5.5, 1.0, -0.1], kind: 'wing' },
  { name: 'patín de cola', pos: [0, -0.28, 4.75], kind: 'tail' },
  { name: 'panza', pos: [0, -0.78, 0.3], kind: 'body' },
  { name: 'deriva', pos: [0, 1.95, 5.0], kind: 'body' },
  { name: 'techo', pos: [0, 1.1, 0.0], kind: 'body' },
  { name: 'estabilizador', pos: [1.7, 0.1, 4.6], kind: 'body' },
  { name: 'estabilizador', pos: [-1.7, 0.1, 4.6], kind: 'body' },
];

export const SURFACE_TYPES = {
  asphalt: { mu: 0.78, muBrake: 0.6, rr: 0.016, rough: 0.0 },
  grass: { mu: 0.52, muBrake: 0.36, rr: 0.065, rough: 0.35 },
  dirt: { mu: 0.55, muBrake: 0.4, rr: 0.09, rough: 0.7 },
  sand: { mu: 0.45, muBrake: 0.35, rr: 0.2, rough: 0.6 },
  rock: { mu: 0.6, muBrake: 0.5, rr: 0.12, rough: 2.2 },
  snow: { mu: 0.3, muBrake: 0.2, rr: 0.14, rough: 0.6 },
  water: { mu: 0.1, muBrake: 0.1, rr: 0.5, rough: 0 },
};

// Coeficientes aerodinámicos (Cl, Cd, Cm) de un elemento. alpha y flap en radianes.
const _co = [0, 0, 0];
function coefficients(s, alpha, flap, geFactor) {
  const AR = s.AR;
  const a = (2 * Math.PI * AR) / (AR + (2 * (AR + 4)) / (AR + 2)); // pendiente corregida por alargamiento
  let dCl = 0, clMaxFrac = 0;
  const fd = Math.abs(flap) / DEG;
  if (s.flapFrac > 0 && flap !== 0) {
    const th = Math.acos(2 * s.flapFrac - 1);
    const tau = 1 - (th - Math.sin(th)) / Math.PI;
    const eta = lerp(0.8, 0.4, clamp((fd - 10) / 50, 0, 1));
    dCl = a * tau * eta * flap * s.flapGain;
    clMaxFrac = clamp(1 - (0.5 * (s.flapFrac - 0.1)) / 0.3, 0, 1);
  }
  const alpha0 = s.alpha0 - dCl / a;
  const clMaxHi = a * (s.stallHi - s.alpha0) + dCl * clMaxFrac;
  const clMaxLo = a * (s.stallLo - s.alpha0) + dCl * clMaxFrac;
  const stallHi = alpha0 + clMaxHi / a, stallLo = alpha0 + clMaxLo / a;
  const padHi = lerp(15, 5, clamp((flap / DEG + 50) / 100, 0, 1)) * DEG * 0.55;
  const padLo = lerp(15, 5, clamp((-flap / DEG + 50) / 100, 0, 1)) * DEG * 0.55;
  const piAR = Math.PI * AR;
  // Arrastre de perfil adicional por flap deflectado.
  const cfTot = s.cf + (s.ctl === 'flap' ? 0.9 * Math.pow(s.flapFrac, 1.38) * Math.sin(flap) * Math.sin(flap) : 0.012 * s.flapFrac * fd * fd / 400);

  let cl, cd, cm;
  // Régimen adherido: perfil con succión de borde de ataque. La resultante solo se inclina
  // el ángulo inducido (línea sustentadora), más la resistencia de perfil que crece con Cl.
  const normal = (al) => {
    cl = a * (al - alpha0);
    const ai = (cl / (piAR * s.e)) * geFactor;
    const ae = al - alpha0 - ai;
    const dcl = cl - s.clMinD - dCl * 0.5;
    cd = cfTot + s.kProfile * dcl * dcl + cl * ai;
    const cn = cl * Math.cos(ae) + cd * Math.sin(ae);
    cm = s.cm0 - 0.2 * dCl - cn * 0.25 * Math.pow((2 * Math.abs(ae)) / Math.PI, 1.2);
  };
  const stalled = (al, sHi) => {
    const sa = sHi ? stallHi : stallLo;
    const clS = a * (sa - alpha0);
    let ai = clS / piAR;
    const alc = clamp(al, -Math.PI / 2, Math.PI / 2);
    const t = sHi ? (Math.PI / 2 - alc) / (Math.PI / 2 - stallHi) : (-Math.PI / 2 - alc) / (-Math.PI / 2 - stallLo);
    ai = lerp(0, ai, clamp(t, 0, 1));
    const ae = al - alpha0 - ai;
    const fl = flap;
    const cd90 = 1.98 - 4.26e-2 * fl * fl + 2.1e-1 * fl;
    const cn = cd90 * Math.sin(ae) * (1 / (0.56 + 0.44 * Math.abs(Math.sin(ae))) - 0.41 * (1 - Math.exp(-17 / AR)));
    const ct = 0.5 * cfTot * Math.cos(ae);
    cl = cn * Math.cos(ae) - ct * Math.sin(ae);
    cd = cn * Math.sin(ae) + ct * Math.cos(ae);
    cm = -cn * 0.25 * Math.pow(Math.min((2 * Math.abs(ae)) / Math.PI, 1), 1.2) - 0.2 * dCl * 0.3;
  };
  if (alpha >= stallLo && alpha <= stallHi) normal(alpha);
  else if (alpha > stallHi + padHi) stalled(alpha, true);
  else if (alpha < stallLo - padLo) stalled(alpha, false);
  else {
    const hi = alpha > stallHi;
    const sa = hi ? stallHi : stallLo, pad = hi ? padHi : -padLo;
    normal(sa);
    const l1 = cl, d1 = cd, m1 = cm;
    stalled(sa + pad, hi);
    let t = (alpha - sa) / pad;
    t = t * t * (3 - 2 * t);
    cl = lerp(l1, cl, t); cd = lerp(d1, cd, t); cm = lerp(m1, cm, t);
  }
  _co[0] = cl; _co[1] = cd; _co[2] = cm;
  return _co;
}

// Hélice de paso fijo: coeficientes de tracción y potencia en función del avance J = V/(nD).
function propCT(J) {
  J = clamp(J, -0.2, 1.7);
  const b = (J - 0.45) / 0.2;
  return 0.098 + 0.04 * J - 0.1507 * J * J + 0.008 * Math.exp(-b * b);
}
function propCP(J) { J = clamp(J, -0.2, 1.7); return 0.0584 + 0.0566 * J - 0.1069 * J * J; }

// Par bruto del motor a plenos gases (N·m) en función de las rpm.
function engineGrossTorque(rpm) {
  const x = (rpm - 2450) / 2450;
  return Math.max(0, 466 * (1 - 0.45 * x * x));
}
function engineFriction(rpm) { return 12 + 0.012 * rpm; }

function gauss(rnd) { // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Aircraft {
  constructor() {
    this.spec = SPEC;
    this.surfaces = buildSurfaces();
    this.gear = GEAR.map((g) => ({ ...g, comp: 0, load: 0, onGround: false, spin: 0, slip: 0, steerAngle: 0, surface: 'asphalt' }));
    this.pos = [0, 100, 0];
    this.vel = [0, 0, 0];
    this.q = [0, 0, 0, 1];
    this.omega = [0, 0, 0];
    this.mass = SPEC.mass;
    this.fuel = 95;
    // Mandos solicitados (entrada) y posiciones reales (salida de actuadores)
    this.input = { pitch: 0, roll: 0, yaw: 0, throttle: 0, flaps: 0, brake: 0, brakeL: 0, brakeR: 0, parkBrake: false, trim: 0, mixture: 1, ignition: true, starter: false };
    this.ctl = { elevator: 0, aileron: 0, rudder: 0, throttle: 0, flaps: 0 };
    this.engine = { rpm: 0, omega: 0, running: false, thrust: 0, torque: 0, power: 0, J: 0, vi: 0, failed: false, fuelFlow: 0 };
    this.atm = { T: 288, p: 101325, rho: 1.225, a: 340 };
    this.wind = [0, 0, 0];       // viento local (mundo)
    this.gust = [0, 0, 0];       // turbulencia (cuerpo)
    this.gustRot = [0, 0, 0];
    this.turbulence = 0;         // intensidad (m/s RMS)
    this.downwash = 0;
    this.t = 0;
    this.crashed = false;
    this.crashReason = '';
    this.noDamage = false;       // ayuda: sin daños estructurales
    this.damage = { gear: false, prop: false, wing: false, overstress: 0 };
    this.events = [];            // eventos discretos (toma de contacto, etc.)
    this.tel = {
      ias: 0, tas: 0, alt: 0, agl: 0, vs: 0, heading: 0, pitch: 0, roll: 0, aoa: 0, beta: 0, g: 1, gLat: 0,
      slipBall: 0, turnRate: 0, stall: 0, stallWarn: false, onGround: false, groundSpeed: 0, mach: 0,
      wheelLoad: 0, bodyAcc: [0, 0, 0], maxG: 1, minG: 1, clWing: 0,
    };
    this._rnd = Math.random;
    this._acc = [0, 0, 0];
    this._wasOnGround = false;
    this._airTime = 0;
    this._F = [0, 0, 0]; this._M = [0, 0, 0];
  }

  // Coloca el avión. heading en grados (0 = norte), pitch/roll en grados, speed en m/s (a lo largo del morro).
  reset({ pos, heading = 0, pitch = 0, roll = 0, speed = 0, engineOn = true, throttle = 0, flaps = 0, fuel = 95 }) {
    this.pos = [pos[0], pos[1], pos[2]];
    const h = heading * DEG, p = pitch * DEG, r = roll * DEG;
    // q = qHeading * qPitch * qRoll
    const qh = [0, Math.sin(-h / 2), 0, Math.cos(-h / 2)];
    const qp = [Math.sin(p / 2), 0, 0, Math.cos(p / 2)];
    const qr = [0, 0, Math.sin(-r / 2), Math.cos(-r / 2)];
    this.q = qmul(qmul(qh, qp), qr);
    const f = qrot(this.q, [0, 0, -1]);
    this.vel = [f[0] * speed, f[1] * speed, f[2] * speed];
    this.omega = [0, 0, 0];
    this.fuel = fuel;
    this.mass = SPEC.mass - 95 + fuel;
    this.input.throttle = throttle; this.ctl.throttle = throttle;
    this.input.flaps = flaps; this.ctl.flaps = flaps;
    this.input.pitch = this.input.roll = this.input.yaw = 0; this.input.trim = 0;
    this.input.brake = 0; this.input.parkBrake = false; this.input.starter = false; this.input.ignition = true; this.input.mixture = 1;
    this.ctl.elevator = this.ctl.aileron = this.ctl.rudder = 0;
    this.engine.failed = false;
    this.engine.running = engineOn;
    this.engine.rpm = engineOn ? (speed > 20 ? 2300 : 700 + 1600 * throttle) : 0;
    this.engine.omega = (this.engine.rpm * Math.PI) / 30;
    this.crashed = false; this.crashReason = '';
    this.damage = { gear: false, prop: false, wing: false, overstress: 0 };
    this._gearReported = false;
    this.gust = [0, 0, 0]; this.gustRot = [0, 0, 0]; this.downwash = 0;
    for (const g of this.gear) { g.comp = 0; g.load = 0; g.onGround = false; g.spin = 0; }
    this.tel.maxG = 1; this.tel.minG = 1;
    this.events.length = 0;
    this._wasOnGround = false; this._airTime = 0;
    this.t = 0;
  }

  // Avanza la simulación dt segundos (se subdivide en pasos fijos de 1/240 s).
  // world: { ground(x, z, out) -> altura, escribe out.n (normal) y out.surface }, wind(pos, out)
  update(dt, world) {
    const H = 1 / 240;
    let n = Math.max(1, Math.min(24, Math.round(dt / H)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.step(h, world);
  }

  step(dt, world) {
    const S = this.spec, I = S.inertia;
    const q = this.q, w = this.omega, v = this.vel, pos = this.pos, inp = this.input, ctl = this.ctl, eng = this.engine;
    this.t += dt;
    isa(pos[1], this.atm);
    const rho = this.atm.rho;

    // ---- actuadores de mando ----
    const vAir = Math.hypot(v[0] - this.wind[0], v[1] - this.wind[1], v[2] - this.wind[2]);
    // Con mucha presión dinámica el piloto no puede deflectar del todo (fuerzas en la palanca).
    const va = S.va * KT;
    const auth = vAir > va ? (va / vAir) * (va / vAir) : 1;
    const kc = 1 - Math.exp(-dt / 0.07);
    ctl.elevator += (clamp(inp.pitch * auth + inp.trim * 0.35, -1, 1) - ctl.elevator) * kc;
    ctl.aileron += (clamp(inp.roll, -1, 1) * auth - ctl.aileron) * kc;
    ctl.rudder += (clamp(inp.yaw, -1, 1) * Math.max(auth, 0.5) - ctl.rudder) * kc;
    ctl.throttle += (clamp(inp.throttle, 0, 1) - ctl.throttle) * (1 - Math.exp(-dt / 0.15));
    const fRate = dt / 7.0; // 0 a 30° en ~7 s
    ctl.flaps += clamp(clamp(inp.flaps, 0, 1) - ctl.flaps, -fRate, fRate);

    // ---- viento y turbulencia ----
    if (world && world.wind) world.wind(pos, this.wind, this);
    const sig = this.turbulence;
    if (sig > 0) {
      const L = 220, Vt = Math.max(vAir, 15);
      const kf = (Vt / L) * dt, kn = sig * Math.sqrt((2 * Vt * dt) / L);
      for (let i = 0; i < 3; i++) {
        this.gust[i] += -this.gust[i] * kf + kn * gauss(this._rnd) * (i === 1 ? 0.8 : 1);
        this.gustRot[i] += -this.gustRot[i] * kf * 2.5 + (kn / 5.5) * 1.6 * gauss(this._rnd);
      }
    } else { this.gust[0] = this.gust[1] = this.gust[2] = 0; this.gustRot[0] = this.gustRot[1] = this.gustRot[2] = 0; }

    // ---- velocidad respecto al aire en ejes cuerpo ----
    const rv = [v[0] - this.wind[0], v[1] - this.wind[1], v[2] - this.wind[2]];
    const vb = qrotInv(q, rv);
    vb[0] -= this.gust[0]; vb[1] -= this.gust[1]; vb[2] -= this.gust[2];
    const wx = w[0] - this.gustRot[0], wy = w[1] - this.gustRot[1], wz = w[2] - this.gustRot[2];
    const V = Math.hypot(vb[0], vb[1], vb[2]);
    const fwdSpeed = -vb[2];

    let Fx = 0, Fy = 0, Fz = 0, Mx = 0, My = 0, Mz = 0;

    // ---- motor y hélice ----
    const D = S.propDiameter, nrev = Math.max(eng.omega / (2 * Math.PI), 0);
    const J = nrev > 0.5 ? fwdSpeed / (nrev * D) : (fwdSpeed > 1 ? 1.7 : 0);
    const n2 = nrev * nrev;
    let thrust = propCT(J) * rho * n2 * D * D * D * D;
    let qProp = (propCP(J) * rho * n2 * D * D * D * D * D) / (2 * Math.PI); // par resistente (+) o motor (-)
    if (this.damage.prop) { thrust *= 0.05; qProp = Math.abs(qProp) * 0.3; }
    const sigma = rho / 1.225;
    const pf = clamp((sigma - 0.12) / 0.88, 0, 1.1);
    const fuelOK = this.fuel > 0 && inp.mixture > 0.15 && inp.ignition && !eng.failed && !this.damage.prop;
    if (!eng.running && fuelOK && eng.rpm > 180) eng.running = true; // arranca al girar (motor de arranque o molinete)
    if (eng.running && (!fuelOK || eng.rpm < 120)) eng.running = false;
    let qEng = -engineFriction(eng.rpm) * (eng.rpm > 5 ? 1 : eng.rpm / 5);
    if (eng.running) {
      const area = 0.0365 + (1 - 0.0365) * Math.pow(ctl.throttle, 1.35);
      const g = Math.min(1, (area * 2700) / Math.max(eng.rpm, 300));
      // Mezcla: rendimiento máximo cerca de 0.85-1; empobrecer demasiado reduce potencia.
      const mix = clamp(inp.mixture, 0, 1);
      const mixEff = clamp(1 - Math.pow(Math.max(0, 0.8 - mix) / 0.65, 2), 0, 1);
      qEng += engineGrossTorque(eng.rpm) * pf * g * mixEff;
      eng.fuelFlow = (engineGrossTorque(eng.rpm) * pf * g * eng.omega) * 8.2e-8 * (0.75 + 0.35 * mix); // kg/s (~0.29 kg/kWh)
      this.fuel = Math.max(0, this.fuel - eng.fuelFlow * dt);
      this.mass = S.mass - 95 + this.fuel;
    } else eng.fuelFlow = 0;
    if (inp.starter && eng.rpm < 450 && !this.damage.prop) qEng += 95;
    eng.omega = Math.max(0, eng.omega + ((qEng - qProp) / S.propInertia) * dt);
    eng.rpm = (eng.omega * 30) / Math.PI;
    eng.thrust = thrust; eng.torque = qProp; eng.J = J; eng.power = qEng * eng.omega;
    // Velocidad inducida por la hélice (teoría de cantidad de movimiento).
    const Ad = (Math.PI * D * D) / 4;
    const Vp = Math.max(fwdSpeed, 0);
    const vi = thrust > 0 ? 0.5 * (-Vp + Math.sqrt(Vp * Vp + (2 * thrust) / (rho * Ad))) : 0;
    eng.vi = vi;
    const washV = 2 * vi * 0.72;       // incremento de velocidad en la estela desarrollada
    const swirlV = vi * 0.17;          // giro de la estela (visto desde atrás, horario)
    // Tracción aplicada en el buje, con desplazamiento lateral por factor P.
    const alphaBody = Math.atan2(-vb[1], Math.max(fwdSpeed, 1));
    const betaBody = Math.atan2(vb[0], Math.max(fwdSpeed, 1));
    const pOffX = clamp(alphaBody, -0.35, 0.35) * 0.24 * (D / 2);
    const pOffY = clamp(betaBody, -0.35, 0.35) * 0.24 * (D / 2);
    const pr = [pOffX, 0.0 + pOffY, -1.92];
    Fz -= thrust;
    Mx += pr[1] * -thrust;           // r × F, F = (0,0,-T)
    My += -pr[0] * -thrust;
    Mz += qProp;                     // reacción del par (hélice horaria vista desde cabina): alabeo a la izquierda
    // Efecto giroscópico de la hélice: L = I·ω hacia delante (-Z).
    const Lp = -S.propInertia * eng.omega;
    Mx -= w[1] * Lp;                 // -(ω × L), L = (0,0,Lp)
    My -= -w[0] * Lp;

    // ---- efecto suelo y deflexión de estela ----
    const agl = this.tel.agl;
    const hb = Math.max(agl + 0.86, 0.3) / S.wingSpan;
    const ge = (16 * hb) * (16 * hb) / (1 + (16 * hb) * (16 * hb));
    let clRootSum = 0, clRootW = 0, clWingSum = 0, areaWing = 0;
    const flapAng = ctl.flaps * 30 * DEG;
    const ail = ctl.aileron, elev = ctl.elevator, rud = ctl.rudder;
    const eps = this.downwash;
    let stallMax = 0;

    for (let i = 0; i < this.surfaces.length; i++) {
      const s = this.surfaces[i], r = s.pos;
      // velocidad del elemento respecto al aire local
      let ux = vb[0] + (wy * r[2] - wz * r[1]);
      let uy = vb[1] + (wz * r[0] - wx * r[2]);
      let uz = vb[2] + (wx * r[1] - wy * r[0]);
      if (s.wash > 0) uz -= washV * s.wash;
      if (s.group === 'vtail') ux -= swirlV;
      if (s.dw > 0) uy += eps * Math.max(fwdSpeed, 0) * s.dw;
      const vc = ux * s.fwd[0] + uy * s.fwd[1] + uz * s.fwd[2];
      const vn = ux * s.nrm[0] + uy * s.nrm[1] + uz * s.nrm[2];
      const v2 = vc * vc + vn * vn;
      if (v2 < 1e-4) continue;
      const alpha = Math.atan2(-vn, vc);
      let flap = 0;
      if (s.ctl === 'flap') flap = flapAng;
      else if (s.ctl === 'ail') flap = s.side > 0 ? -ail * (ail > 0 ? 20 : 15) * DEG : ail * (ail > 0 ? 15 : 20) * DEG;
      else if (s.ctl === 'elev') flap = -elev * (elev > 0 ? 28 : 23) * DEG;
      else if (s.ctl === 'rud') flap = -rud * 17.5 * DEG;
      const co = coefficients(s, alpha, flap, s.group === 'wing' ? ge : 1);
      const qS = 0.5 * rho * v2 * s.area * s.qf;
      let L = qS * co[0];
      if (s.group === 'wing') L *= 1 + 0.08 * (1 - ge);
      const Dg = qS * co[1], Mm = qS * s.chord * co[2];
      const sa = Math.sin(alpha), ca = Math.cos(alpha);
      const fx = L * (sa * s.fwd[0] + ca * s.nrm[0]) + Dg * (-ca * s.fwd[0] + sa * s.nrm[0]);
      const fy = L * (sa * s.fwd[1] + ca * s.nrm[1]) + Dg * (-ca * s.fwd[1] + sa * s.nrm[1]);
      const fz = L * (sa * s.fwd[2] + ca * s.nrm[2]) + Dg * (-ca * s.fwd[2] + sa * s.nrm[2]);
      if (this.dbg) this.dbg.push({ name: s.name, alpha, flap, cl: co[0], cd: co[1], cm: co[2], L, D: Dg, f: [fx, fy, fz], v: Math.sqrt(v2) });
      Fx += fx; Fy += fy; Fz += fz;
      Mx += r[1] * fz - r[2] * fy + Mm * s.span[0];
      My += r[2] * fx - r[0] * fz + Mm * s.span[1];
      Mz += r[0] * fy - r[1] * fx + Mm * s.span[2];
      if (s.group === 'wing') {
        clWingSum += co[0] * s.area; areaWing += s.area;
        if (s.root > 0) { clRootSum += co[0] * s.area * s.root; clRootW += s.area * s.root; }
        const sm = (alpha - (s.stallHi - 0.0)) ; // margen hasta la pérdida de este elemento (sin flap)
        const k = clamp(1 + sm / (4 * DEG), 0, 1.5);
        if (k > stallMax) stallMax = k;
      }
    }
    // La deflexión de estela llega a la cola con retardo ~ l/V.
    const clRoot = clRootW > 0 ? clRootSum / clRootW : 0;
    const epsTarget = clamp(0.082 * clRoot, -0.2, 0.25);
    this.downwash += (epsTarget - this.downwash) * (1 - Math.exp((-dt * Math.max(fwdSpeed, 5)) / 4.4));
    this.tel.clWing = areaWing > 0 ? clWingSum / areaWing : 0;

    // ---- fuselaje y otros cuerpos romos ----
    for (let i = 0; i < BODIES.length; i++) {
      const b = BODIES[i], r = b.pos;
      const ux = vb[0] + (wy * r[2] - wz * r[1]);
      const uy = vb[1] + (wz * r[0] - wx * r[2]);
      const uz = vb[2] + (wx * r[1] - wy * r[0]);
      const um = Math.hypot(ux, uy, uz);
      const k = -0.5 * rho * um;
      const fx = k * b.A[0] * ux, fy = k * b.A[1] * uy, fz = k * b.A[2] * uz;
      if (this.dbg) this.dbg.push({ name: 'cuerpo' + i, f: [fx, fy, fz] });
      Fx += fx; Fy += fy; Fz += fz;
      Mx += r[1] * fz - r[2] * fy;
      My += r[2] * fx - r[0] * fz;
      Mz += r[0] * fy - r[1] * fx;
    }

    // ---- gravedad (en ejes cuerpo) ----
    const gb = qrotInv(q, [0, -G0 * this.mass, 0]);
    const aeroF = [Fx, Fy, Fz]; // fuerza no gravitatoria (para el factor de carga)
    Fx += gb[0]; Fy += gb[1]; Fz += gb[2];

    // ---- tren de aterrizaje y contactos ----
    let onGround = false, wheelLoad = 0;
    const gout = _gout;
    let groundH = world ? world.ground(pos[0], pos[2], gout) : -1e9;
    const underY = groundH;
    if (world && pos[1] - groundH < 30) {
      const brakeBase = inp.parkBrake ? 1 : clamp(inp.brake, 0, 1);
      for (let i = 0; i < this.gear.length; i++) {
        const g = this.gear[i];
        const collapsed = this.damage.gear;
        const rp = collapsed ? [g.pos[0], g.pos[1] + 0.55, g.pos[2]] : g.pos;
        const wp = qrot(q, rp);
        const px = pos[0] + wp[0], py = pos[1] + wp[1], pz = pos[2] + wp[2];
        const gh = world.ground(px, pz, gout);
        const nx = gout.n[0], ny = gout.n[1], nz = gout.n[2];
        const st = SURFACE_TYPES[gout.surface] || SURFACE_TYPES.grass;
        g.surface = gout.surface;
        let pen = (gh - py) * ny;
        if (st.rough > 0 && pen > -0.1) {
          // microrrelieve del terreno sin preparar
          pen += st.rough * 0.03 * (Math.sin(px * 1.7 + pz * 0.9) + Math.sin(px * 0.6 - pz * 2.1)) * 0.5;
        }
        if (pen <= 0) { g.onGround = false; g.comp = 0; g.load = 0; g.slip = 0; continue; }
        // velocidad del punto de contacto (mundo)
        const wv = qrot(q, [w[1] * rp[2] - w[2] * rp[1], w[2] * rp[0] - w[0] * rp[2], w[0] * rp[1] - w[1] * rp[0]]);
        const cvx = v[0] + wv[0], cvy = v[1] + wv[1], cvz = v[2] + wv[2];
        const vnrm = cvx * nx + cvy * ny + cvz * nz;
        let Fn;
        if (collapsed) Fn = 220000 * pen - 9000 * vnrm;
        else {
          Fn = g.k * pen - g.c * vnrm;
          if (pen > GEAR_TRAVEL) Fn += 400000 * (pen - GEAR_TRAVEL);
        }
        if (Fn < 0) Fn = 0;
        if (!g.onGround && !collapsed) {
          // toma de contacto de esta rueda
          this.events.push({ type: 'touch', wheel: g.name, vs: -vnrm, t: this.t, surface: gout.surface, speed: Math.hypot(cvx, cvz) });
        }
        g.onGround = true; g.comp = pen; g.load = Fn;
        onGround = true; wheelLoad += Fn;
        if (!collapsed && !this.noDamage && (Fn > g.maxLoad || -vnrm > 4.2)) {
          this.damage.gear = true;
          this.events.push({ type: 'gearCollapse', wheel: g.name, t: this.t });
        }
        // direcciones de rodadura y lateral sobre el plano del suelo
        let sAng = 0;
        if (g.steer) {
          const gs = Math.hypot(v[0], v[2]);
          sAng = -ctl.rudder * lerp(30, 9, clamp(gs / 14, 0, 1)) * DEG;
          g.steerAngle = sAng;
        }
        const fb = qrot(q, [-Math.sin(sAng), 0, -Math.cos(sAng)]);
        let fdn = fb[0] * nx + fb[1] * ny + fb[2] * nz;
        let rx = fb[0] - fdn * nx, ry = fb[1] - fdn * ny, rz = fb[2] - fdn * nz;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl; ry /= rl; rz /= rl;
        const lx = ny * rz - nz * ry, ly = nz * rx - nx * rz, lz = nx * ry - ny * rx; // n × r
        const tvx = cvx - vnrm * nx, tvy = cvy - vnrm * ny, tvz = cvz - vnrm * nz;
        const vlong = tvx * rx + tvy * ry + tvz * rz;
        const vlat = tvx * lx + tvy * ly + tvz * lz;
        g.spin = vlong / g.radius;
        let brake = 0;
        if (g.brake) {
          // Frenado diferencial: el pedal de dirección alivia el freno del lado contrario.
          const relief = inp.parkBrake ? 0 : 0.75 * clamp(-ctl.rudder * g.side, 0, 1);
          brake = clamp(brakeBase * (1 - relief) + (g.side < 0 ? inp.brakeL : inp.brakeR), 0, 1);
        }
        if (collapsed) brake = 1;
        const muLong = (collapsed ? 0.55 : st.rr + brake * st.muBrake);
        let flong = -muLong * Fn * clamp(vlong / 0.3, -1, 1);
        // fuerza lateral: rigidez de deriva saturada; a baja velocidad, amortiguamiento viscoso
        let flat;
        const avl = Math.abs(vlong);
        const muLat = collapsed ? 0.6 : st.mu;
        if (avl > 2.5) {
          const slip = Math.atan2(vlat, avl);
          flat = -muLat * Fn * Math.sin(1.35 * Math.atan(9.5 * slip));
          g.slip = Math.abs(slip);
        } else {
          flat = -clamp(vlat * (muLat * Fn) / 0.12, -muLat * Fn, muLat * Fn);
          g.slip = Math.min(Math.abs(vlat) / 3, 0.3);
        }
        const fm = Math.hypot(flong, flat), fmax = Math.max(muLat, muLong) * Fn;
        if (fm > fmax && fm > 0) { flong *= fmax / fm; flat *= fmax / fm; }
        // fuerza total en mundo -> cuerpo
        const fwx = Fn * nx + flong * rx + flat * lx;
        const fwy = Fn * ny + flong * ry + flat * ly;
        const fwz = Fn * nz + flong * rz + flat * lz;
        const fbd = qrotInv(q, [fwx, fwy, fwz]);
        Fx += fbd[0]; Fy += fbd[1]; Fz += fbd[2];
        aeroF[0] += fbd[0]; aeroF[1] += fbd[1]; aeroF[2] += fbd[2];
        Mx += rp[1] * fbd[2] - rp[2] * fbd[1];
        My += rp[2] * fbd[0] - rp[0] * fbd[2];
        Mz += rp[0] * fbd[1] - rp[1] * fbd[0];
      }
      // puntos duros de la célula
      for (let i = 0; i < HARD.length; i++) {
        const hp = HARD[i], rp = hp.pos;
        const wp = qrot(q, rp);
        const px = pos[0] + wp[0], py = pos[1] + wp[1], pz = pos[2] + wp[2];
        const gh = world.ground(px, pz, gout);
        const pen = gh - py;
        if (pen <= 0) continue;
        const nx = gout.n[0], ny = gout.n[1], nz = gout.n[2];
        const wv = qrot(q, [w[1] * rp[2] - w[2] * rp[1], w[2] * rp[0] - w[0] * rp[2], w[0] * rp[1] - w[1] * rp[0]]);
        const cvx = v[0] + wv[0], cvy = v[1] + wv[1], cvz = v[2] + wv[2];
        const vnrm = cvx * nx + cvy * ny + cvz * nz;
        const speed = Math.hypot(cvx, cvy, cvz);
        if (hp.kind === 'prop' && !this.damage.prop && eng.rpm > 100 && !this.noDamage) {
          this.damage.prop = true;
          this.events.push({ type: 'propStrike', t: this.t });
        }
        if (!this.crashed && hp.kind !== 'prop') {
          // El patín de cola aguanta un roce en la rotación; el resto de la célula, no.
          const hard = (hp.kind === 'tail') ? (-vnrm > 5.0) : (speed > 7 || -vnrm > 2.0);
          if (hard) this._crash(`Impacto: ${hp.name}`);
          else if (hp.kind === 'wing') this.damage.wing = true;
          else if (hp.kind === 'tail' && this.t - (this._tailT || -10) > 3) { this._tailT = this.t; this.events.push({ type: 'tailStrike', t: this.t }); }
        }
        let Fn = Math.min(160000 * pen - 7000 * vnrm, 250000);
        if (Fn < 0) Fn = 0;
        onGround = true;
        const tvx = cvx - vnrm * nx, tvy = cvy - vnrm * ny, tvz = cvz - vnrm * nz;
        const tv = Math.hypot(tvx, tvy, tvz);
        const mu = 0.5 * Math.min(tv / 0.3, 1);
        const fwx = Fn * nx - (tv > 1e-4 ? (mu * Fn * tvx) / tv : 0);
        const fwy = Fn * ny - (tv > 1e-4 ? (mu * Fn * tvy) / tv : 0);
        const fwz = Fn * nz - (tv > 1e-4 ? (mu * Fn * tvz) / tv : 0);
        const fbd = qrotInv(q, [fwx, fwy, fwz]);
        Fx += fbd[0]; Fy += fbd[1]; Fz += fbd[2];
        aeroF[0] += fbd[0]; aeroF[1] += fbd[1]; aeroF[2] += fbd[2];
        Mx += rp[1] * fbd[2] - rp[2] * fbd[1];
        My += rp[2] * fbd[0] - rp[0] * fbd[2];
        Mz += rp[0] * fbd[1] - rp[1] * fbd[0];
      }
    }

    // ---- integración ----
    const m = this.mass;
    const aw = qrot(q, [Fx / m, Fy / m, Fz / m]);
    v[0] += aw[0] * dt; v[1] += aw[1] * dt; v[2] += aw[2] * dt;
    // Reposo con freno de estacionamiento: evita el deslizamiento residual.
    if (onGround && (inp.parkBrake || inp.brake > 0.9) && ctl.throttle < 0.25 && Math.hypot(v[0], v[2]) < 0.25) {
      const kd = Math.exp(-dt * 12);
      v[0] *= kd; v[2] *= kd; w[1] *= kd;
    }
    pos[0] += v[0] * dt; pos[1] += v[1] * dt; pos[2] += v[2] * dt;
    // Ecuaciones de Euler (tensor de inercia diagonal en ejes cuerpo)
    const ax = (Mx - (I[2] - I[1]) * w[1] * w[2]) / I[0];
    const ay = (My - (I[0] - I[2]) * w[2] * w[0]) / I[1];
    const az = (Mz - (I[1] - I[0]) * w[0] * w[1]) / I[2];
    w[0] += ax * dt; w[1] += ay * dt; w[2] += az * dt;
    // q' = 0.5 * q ⊗ ω
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3], hd = 0.5 * dt;
    q[0] += hd * (qw * w[0] + qy * w[2] - qz * w[1]);
    q[1] += hd * (qw * w[1] + qz * w[0] - qx * w[2]);
    q[2] += hd * (qw * w[2] + qx * w[1] - qy * w[0]);
    q[3] += hd * (-qx * w[0] - qy * w[1] - qz * w[2]);
    const ql = Math.hypot(q[0], q[1], q[2], q[3]);
    q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;

    // ---- telemetría ----
    const tel = this.tel;
    tel.tas = V; tel.ias = V * Math.sqrt(sigma);
    tel.mach = V / this.atm.a;
    tel.alt = pos[1];
    tel.agl = pos[1] - Math.max(underY, 0) - 1.19;
    tel.vs = v[1];
    tel.groundSpeed = Math.hypot(v[0], v[2]);
    const f = qrot(q, [0, 0, -1]), up = qrot(q, [0, 1, 0]), right = qrot(q, [1, 0, 0]);
    tel.heading = (Math.atan2(f[0], -f[2]) / DEG + 360) % 360;
    tel.pitch = Math.asin(clamp(f[1], -1, 1));
    tel.roll = Math.atan2(-right[1], up[1]);
    tel.aoa = fwdSpeed > 3 ? Math.atan2(-vb[1], fwdSpeed) : 0;
    tel.beta = V > 3 ? Math.asin(clamp(vb[0] / V, -1, 1)) : 0;
    tel.g = aeroF[1] / (m * G0);
    tel.gLat = aeroF[0] / (m * G0);
    tel.bodyAcc[0] = aeroF[0] / m; tel.bodyAcc[1] = aeroF[1] / m; tel.bodyAcc[2] = aeroF[2] / m;
    tel.slipBall = clamp(-aeroF[0] / Math.max(Math.abs(aeroF[1]), 0.3 * m * G0), -1, 1);
    const ww = qrot(q, w);
    tel.turnRate = -ww[1];   // rad/s, positivo = viraje a la derecha
    tel.onGround = onGround; tel.wheelLoad = wheelLoad;
    tel.stall = fwdSpeed > 8 ? stallMax : 0;
    tel.stallWarn = !onGround && fwdSpeed > 12 && stallMax > 0.25;
    if (!onGround) { if (tel.g > tel.maxG) tel.maxG = tel.g; if (tel.g < tel.minG) tel.minG = tel.g; }

    // ---- límites estructurales ----
    if (!this.crashed) {
      const iasKt = tel.ias / KT;
      if (tel.g > 6.2 || tel.g < -3.2) { this.damage.overstress += dt; if (this.damage.overstress > 0.15) this._crash('Fallo estructural por exceso de factor de carga'); }
      else if (iasKt > S.vne * 1.14) { this.damage.overstress += dt; if (this.damage.overstress > 0.6) this._crash('Fallo estructural por exceso de velocidad (flameo)'); }
      else this.damage.overstress = Math.max(0, this.damage.overstress - dt * 0.5);
      if (pos[1] < 0.3 && underY <= 0.0) this._crash('Amerizaje');
      if (this.damage.gear && !this._gearReported) { this._gearReported = true; this._crash('Colapso del tren de aterrizaje'); }
    }
    if (onGround) this._airTime = 0; else this._airTime += dt;
    this._wasOnGround = onGround;
  }

  _crash(reason) {
    if (this.crashed) return;
    if (this.noDamage && reason !== 'Amerizaje') return;
    this.crashed = true;
    this.crashReason = reason;
    this.engine.failed = true;
    this.events.push({ type: 'crash', reason, t: this.t });
  }
}

// --- utilidades de cuaterniones sin asignación compartida ---
const _gout = { n: [0, 1, 0], surface: 'grass' };
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qrot(q, v) {
  const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
function qrotInv(q, v) {
  const x = v[0], y = v[1], z = v[2], qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
export { qrot, qrotInv, qmul, GEAR, HARD };
