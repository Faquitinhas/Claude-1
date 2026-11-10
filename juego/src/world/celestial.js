// Posición del Sol y la Luna a partir de la hora local, el día del año y la latitud.
import { DEG } from '../core/math.js';

// Ejes del mundo: +X este, +Y arriba, +Z sur.
function fromEquatorial(decl, hourAngle, lat) {
  const sd = Math.sin(decl), cd = Math.cos(decl), sl = Math.sin(lat), cl = Math.cos(lat);
  const east = -cd * Math.sin(hourAngle);
  const north = sd * cl - cd * sl * Math.cos(hourAngle);
  const up = sl * sd + cl * cd * Math.cos(hourAngle);
  return [east, up, -north];
}

export function sunDirection(hours, dayOfYear, latDeg) {
  const decl = -23.44 * DEG * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const H = (hours - 12) * 15 * DEG;
  return fromEquatorial(decl, H, latDeg * DEG);
}

// phase: 0 = luna nueva, 0.5 = llena. Devuelve dirección y fracción iluminada.
export function moonState(hours, dayOfYear, latDeg, phase) {
  const declS = -23.44 * DEG * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const H = (hours - 12) * 15 * DEG - 2 * Math.PI * phase;
  // La Luna llena está aproximadamente en la declinación opuesta a la del Sol.
  const decl = -declS * Math.cos(2 * Math.PI * (phase - 0.5)) + 5 * DEG * Math.sin(2 * Math.PI * phase * 3.0 + 1.0);
  const dir = fromEquatorial(decl, H, latDeg * DEG);
  const fraction = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  return { dir, fraction };
}

// Rotación del cielo estrellado (matriz 3x3 column-major): gira alrededor del eje polar.
export function starRotation(hours, dayOfYear, latDeg) {
  const lat = latDeg * DEG;
  const ang = ((hours / 24) + dayOfYear / 365.25) * 2 * Math.PI;
  // eje polar en el mundo: hacia el norte (-Z) elevado 'lat'
  const ax = [0, Math.sin(lat), -Math.cos(lat)];
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  const [x, y, z] = ax;
  return new Float32Array([
    t * x * x + c, t * x * y + s * z, t * x * z - s * y,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c,
  ]);
}
