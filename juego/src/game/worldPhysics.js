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
    out[0] = wx; out[1] = clamp(up, -6, 6) * clamp(agl / 20, 0, 1); out[2] = wz;
    // turbulencia: mecánica (viento sobre relieve) + térmica diurna bajo cúmulos
    const rough = Math.min(Math.hypot(dhx, dhz) * 2.5, 1);
    const mech = e.wind.speed * (0.05 + 0.16 * rough) * Math.exp(-agl / 700);
    const sunUp = clamp(e.sunDir[1] * 2.5, 0, 1);
    const thermal = 0.55 * sunUp * e.clouds.coverage * clamp(agl / 150, 0, 1) * Math.exp(-Math.max(pos[1] - e.clouds.base, 0) / 600);
    ac.turbulence = (mech + thermal) * (e.turbulenceScale ?? 1);
  }
}
