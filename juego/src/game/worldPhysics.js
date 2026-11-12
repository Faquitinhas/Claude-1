// Adaptador del mundo para la física: altura/normal/tipo de superficie del suelo y viento local.
import { AIRPORTS, runwayLocal, pavedAt } from '../world/airports.js';
import { clamp } from '../core/math.js';

const DEG = Math.PI / 180;

export class WorldPhysics {
  constructor(terrainData, env) {
    this.T = terrainData;
    this.env = env;
    this._n = [0, 1, 0];
    this._windT = 0;
    this._ridge = 0;
  }

  // Altura del suelo en (x, z). Escribe out.n (normal) y out.surface.
  ground(x, z, out) {
    const h = this.T.height(x, z, out.n);
    let surface = 'grass';
    if (h <= 0.05) surface = 'water';
    else if (h < 3.5) surface = 'sand';
    else if (out.n[1] < 0.8) surface = 'rock';
    else if (h > 1800) surface = 'snow';
    for (let i = 0; i < AIRPORTS.length; i++) {
      const a = AIRPORTS[i];
      if (Math.abs(x - a.x) > 1500 || Math.abs(z - a.z) > 1500) continue;
      const [al, ac] = runwayLocal(a, x, z);
      if (pavedAt(a, al, ac)) { surface = 'asphalt'; break; }
    }
    out.surface = surface;
    return h;
  }

  // Viento local (mundo) en la posición del avión: gradiente con la altura y ascendencias de ladera.
  wind(pos, out, ac) {
    const e = this.env, T = this.T;
    const to = (e.wind.dir + 180) * DEG;
    const gh = Math.max(T.heightNearest(pos[0], pos[2]), 0);
    const agl = Math.max(pos[1] - gh, 0);
    // capa límite: el viento crece con la altura sobre el terreno
    const k = (0.45 + 0.55 * clamp(agl / 250, 0, 1)) * (1 + clamp(pos[1] / 3000, 0, 1) * 0.6);
    const sp = e.wind.speed * k;
    const wx = Math.sin(to) * sp, wz = -Math.cos(to) * sp;
    // ascendencia orográfica: el viento que remonta una ladera sube
    const d = 220;
    const dhx = (T.heightNearest(pos[0] + d, pos[2]) - T.heightNearest(pos[0] - d, pos[2])) / (2 * d);
    const dhz = (T.heightNearest(pos[0], pos[2] + d) - T.heightNearest(pos[0], pos[2] - d)) / (2 * d);
    const up = (wx * dhx + wz * dhz) * Math.exp(-agl / 450) * 0.75;
    out[0] = wx; out[1] = clamp(up, -6, 6) * clamp(agl / 20, 0, 1) + this.thermal(pos, agl, wx, wz); out[2] = wz;
    // turbulencia: mecánica (viento sobre relieve) + térmica diurna bajo cúmulos
    const rough = Math.min(Math.hypot(dhx, dhz) * 2.5, 1);
    const mech = e.wind.speed * (0.05 + 0.16 * rough) * Math.exp(-agl / 700);
    const sunUp = clamp(e.sunDir[1] * 2.5, 0, 1);
    const thermal = (0.4 + 0.5 * Math.min(Math.abs(this._th || 0) / 2, 1)) * sunUp * e.clouds.coverage * clamp(agl / 150, 0, 1) * Math.exp(-Math.max(pos[1] - e.clouds.base, 0) / 600);
    ac.turbulence = (mech + thermal + (e.rain || 0) * 0.3) * (e.turbulenceScale ?? 1);
  }

  // Térmicas: columnas de aire caliente que nacen sobre tierra soleada y derivan con el viento.
  // Campo celular determinista: cada celda de 1,6 km puede tener una térmica con núcleo
  // ascendente y un anillo de descendencia alrededor.
  thermal(pos, agl, wx, wz) {
    const e = this.env;
    const sun = clamp(e.sunDir[1] * 2.2 - 0.25, 0, 1) * (1 - (e.rain || 0));
    this._th = 0;
    if (sun <= 0 || agl < 30) return 0;
    const top = e.clouds.coverage > 0.05 ? e.clouds.base + 150 : 1900;
    if (pos[1] > top) return 0;
    const C = 1600, t = e.time;
    const px = pos[0] - wx * t * 0.6, pz = pos[2] - wz * t * 0.6;   // el campo deriva con el viento
    const cx = Math.floor(px / C), cz = Math.floor(pz / C);
    let w = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gz = cz + j;
      let h = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453; h -= Math.floor(h);
      let h2 = Math.sin(gx * 269.5 + gz * 183.3) * 43758.5453; h2 -= Math.floor(h2);
      let h3 = Math.sin(gx * 419.2 + gz * 371.9) * 43758.5453; h3 -= Math.floor(h3);
      if (h3 > 0.35 + e.clouds.coverage * 0.7) continue;
      const tx = (gx + 0.2 + 0.6 * h) * C, tz = (gz + 0.2 + 0.6 * h2) * C;
      // solo sobre tierra firme
      if (this.T.heightNearest(tx + wx * t * 0.6, tz + wz * t * 0.6) < 4) continue;
      const R = 220 + 200 * h2, W = (1.6 + 2.6 * h) * sun;
      const r2 = ((px - tx) ** 2 + (pz - tz) ** 2) / (R * R);
      if (r2 > 9) continue;
      w += W * (Math.exp(-r2) - 0.22 * Math.exp(-r2 / 4));
    }
    // perfil vertical: crece desde el suelo y se agota al llegar a la base de las nubes
    const prof = clamp(agl / 250, 0, 1) * clamp((top - pos[1]) / 300, 0, 1);
    this._th = w * prof;
    return this._th;
  }
}
