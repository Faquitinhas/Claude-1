// Misiones y evaluación de aterrizajes.
import { KT, FT } from '../aircraft/fdm.js';
import { AIRPORTS, runwayLocal, pavedAt } from '../world/airports.js';

const ap = (id) => AIRPORTS.find((a) => a.id === id);
const kt = (g) => g.ac.tel.ias / KT;
const altFt = (g) => g.ac.tel.alt / FT;

// Cada paso: texto principal, pista de ayuda y condición de cumplimiento.
export const MISSIONS = [
  {
    id: 'primer-vuelo', title: 'Primer vuelo', level: 1,
    desc: 'Aprende lo esencial: despegar de Puerto Aurora y ascender sobre el mar en una mañana tranquila.',
    env: { time: 9.4, coverage: 0.22, wind: { dir: 70, speed: 2 }, haze: 2.5 },
    start: { airport: 'HZPA', end: 0 },
    steps: [
      { text: 'Suelta el freno de estacionamiento', hint: { key: 'B', touch: 'botón FRENO EST.' }, check: (g) => !g.ac.input.parkBrake },
      { text: 'Aplica toda la potencia', hint: { key: 'W (mantener)', touch: 'sube la palanca de gases' }, check: (g) => g.ac.input.throttle > 0.95 },
      { text: 'Mantén el eje de la pista y acelera hasta 55 nudos', hint: { key: '← → para dirigir', touch: 'mueve la palanca a los lados' }, check: (g) => kt(g) > 54 },
      { text: 'Tira suavemente para levantar el morro', hint: { key: '↓ (tirar)', touch: 'palanca hacia abajo' }, check: (g) => !g.ac.tel.onGround && g.ac.tel.agl > 8 },
      { text: 'Asciende a 1.500 pies manteniendo unos 75 nudos', hint: { key: 'el morro controla la velocidad', touch: 'el morro controla la velocidad' }, check: (g) => altFt(g) > 1500 },
      { text: 'Reduce a 2.300 rpm y nivela el avión', hint: { key: 'S reduce gases', touch: 'baja un poco los gases' }, check: (g) => g.ac.engine.rpm < 2420 && Math.abs(g.ac.tel.vs) < 2.5, hold: 3 },
    ],
    done: '¡Ya vuelas! Explora la isla o vuelve a aterrizar cuando quieras.',
    freeAfter: true,
  },
  {
    id: 'aterrizaje', title: 'Aterrizaje', level: 2,
    desc: 'Estás en final para la pista 07 de Puerto Aurora, a 4 km. Mantén 65 nudos, apunta a los números y recoge antes de tocar.',
    env: { time: 16.8, coverage: 0.3, wind: { dir: 80, speed: 3 }, haze: 3 },
    start: { airport: 'HZPA', end: 0, approach: 4, speed: 70, flaps: 2 / 3, throttle: 0.36 },
    landing: { airport: 'HZPA' },
    tips: ['Las luces PAPI junto a la pista: 2 rojas y 2 blancas = senda correcta', 'Gases para la altura, morro para la velocidad', 'A unos 5 m del suelo, corta gases y sube el morro poco a poco'],
  },
  {
    id: 'circuito', title: 'Circuito de tráfico', level: 2,
    desc: 'Despega de la pista 07, vira a la izquierda para hacer el circuito completo y aterriza de nuevo en la misma pista.',
    env: { time: 11, coverage: 0.35, wind: { dir: 60, speed: 4 }, haze: 3 },
    start: { airport: 'HZPA', end: 0 },
    steps: [
      { text: 'Despega y asciende a 1.000 pies', check: (g) => altFt(g) > 1000 },
      { text: 'Vira a la izquierda hasta rumbo 250° (tramo de viento en cola)', check: (g) => Math.abs(((g.ac.tel.heading - 250 + 540) % 360) - 180) < 20 && altFt(g) > 800 },
      { text: 'Pasado el final de la pista, reduce, pon flaps y vira hacia final (rumbo 070°)', check: (g) => Math.abs(((g.ac.tel.heading - 70 + 540) % 360) - 180) < 15 && g.nav.dist < 6000 && altFt(g) < 1500 },
    ],
    landing: { airport: 'HZPA' },
  },
  {
    id: 'viento-cruzado', title: 'Viento cruzado', level: 3,
    desc: 'Final a la pista 07 con 14 nudos de viento del norte y turbulencia. Corrige la deriva y aterriza alineado.',
    env: { time: 14.5, coverage: 0.55, wind: { dir: 350, speed: 7.2 }, haze: 4, turbulence: 1.4 },
    start: { airport: 'HZPA', end: 0, approach: 3.5, speed: 72, flaps: 1 / 3, throttle: 0.42 },
    landing: { airport: 'HZPA' },
    tips: ['Apunta el morro hacia el viento para no desviarte', 'Justo antes de tocar, alinea con el timón y baja el ala del lado del viento'],
  },
  {
    id: 'lluvia', title: 'Aterrizaje con lluvia', level: 3,
    desc: 'Final a la pista 07 bajo la lluvia, con poca visibilidad y la pista mojada: frena menos y resbala más. Toca pronto y frena con suavidad.',
    env: { time: 15.5, coverage: 0.95, wind: { dir: 65, speed: 4 }, haze: 9, rain: 0.85, turbulence: 1 },
    start: { airport: 'HZPA', end: 0, approach: 3.5, speed: 70, flaps: 2 / 3, throttle: 0.38 },
    landing: { airport: 'HZPA' },
    tips: ['Busca las luces de la pista entre la lluvia', 'Con la pista mojada la frenada se alarga: no llegues largo ni rápido'],
  },
  {
    id: 'montana', title: 'Pista de montaña', level: 4,
    desc: 'Valle Alto: 720 metros de pista a 2.850 pies, entre cumbres, con la luz del atardecer. Sin margen para llegar largo.',
    env: { time: 18.1, coverage: 0.3, wind: { dir: 70, speed: 2.5 }, haze: 3 },
    start: { airport: 'HZVA', end: 0, approach: 3.2, speed: 68, flaps: 2 / 3, throttle: 0.42 },
    landing: { airport: 'HZVA' },
    tips: ['A esta altitud el avión vuela más rápido sobre el suelo: frena con decisión', 'Flaps a 30° y 60 nudos en corta final'],
  },
  {
    id: 'travesia', title: 'Travesía al volcán', level: 3,
    desc: 'Despega de Puerto Aurora, cruza el brazo de mar hacia el norte y aterriza en la Isla del Volcán (HZIV). Usa el mapa (M) y el GPS.',
    env: { time: 10.2, coverage: 0.45, wind: { dir: 250, speed: 5 }, haze: 3 },
    start: { airport: 'HZPA', end: 0 },
    nav: 'HZIV',
    landing: { airport: 'HZIV' },
    tips: ['El marcador rosa de la brújula señala el destino', 'Crucero a 2.300 rpm y unos 3.500 pies'],
  },
  {
    id: 'motor-parado', title: 'Motor parado', level: 4,
    desc: 'El motor falla a 3.500 pies, a 6 km de Puerto Aurora. Mantén 68 nudos (mejor planeo) y llega a la pista.',
    env: { time: 12.5, coverage: 0.3, wind: { dir: 70, speed: 3 }, haze: 3 },
    start: { air: { x: 4350, z: 12700, alt: 1070, heading: 68, speed: 90 * KT, throttle: 0.6 } },
    engineFailAfter: 4,
    landing: { airport: 'HZPA', any: true },
    tips: ['Mejor planeo: 68 nudos, unos 9 metros de avance por cada metro de descenso', 'No pongas flaps hasta tener la pista asegurada'],
  },
  {
    id: 'nocturno', title: 'Aproximación nocturna', level: 4,
    desc: 'Noche de luna sobre el mar. Solo las luces de pista y el PAPI te guían hasta Puerto Aurora.',
    env: { time: 22.8, coverage: 0.15, wind: { dir: 70, speed: 2 }, haze: 2.5 },
    start: { airport: 'HZPA', end: 0, approach: 5, speed: 72, flaps: 1 / 3, throttle: 0.42 },
    landing: { airport: 'HZPA' },
    tips: ['Confía en los instrumentos: de noche no hay horizonte', 'PAPI: demasiado blanco, vas alto; demasiado rojo, vas bajo'],
  },
];

export const FREE_FLIGHT = {
  id: 'libre', title: 'Vuelo libre', level: 0,
  desc: 'Elige aeródromo, hora y meteorología, y vuela a tu aire.',
  env: { time: 10.5, coverage: 0.35, wind: { dir: 70, speed: 3 }, haze: 3 },
  start: { airport: 'HZPA', end: 0 },
  free: true,
};

// Evalúa una toma de tierra. Devuelve puntuación (0-100), estrellas y desglose.
// Niveles de dificultad: viento y turbulencia, ayudas, resistencia del tren y exigencia al puntuar.
export const DIFFICULTY = [
  { name: 'Fácil', desc: 'Menos viento y turbulencia, el avión se nivela solo y avisa antes de entrar en pérdida, tren más resistente y puntuación generosa.', wind: 0.5, turb: 0.4, stab: true, rudder: 1, tough: 1.7, lenient: 1.5, stars: [75, 50, 25] },
  { name: 'Normal', desc: 'El vuelo tal cual es, con las ayudas que elijas en Ajustes.', wind: 1, turb: 1, stab: false, rudder: null, tough: 1, lenient: 1, stars: [85, 65, 40] },
  { name: 'Difícil', desc: 'Más viento y turbulencia, timón siempre manual, tren más frágil y puntuación exigente.', wind: 1.35, turb: 1.6, stab: false, rudder: 0, tough: 0.85, lenient: 0.8, stars: [90, 75, 55] },
];

export function scoreLanding(L, a, df = DIFFICULTY[1]) {
  const fpm = (L.vs / FT) * 60;
  const parts = [];
  // 1. Régimen de descenso en el contacto
  let sVs;
  const f = fpm / df.lenient;   // la exigencia depende de la dificultad
  if (f <= 120) sVs = 1; else if (f <= 300) sVs = 1 - 0.35 * ((f - 120) / 180);
  else if (f <= 600) sVs = 0.65 - 0.5 * ((f - 300) / 300); else sVs = 0.05;
  parts.push({ label: 'Suavidad', value: `${Math.round(fpm)} ft/min`, score: sVs, note: fpm <= 120 ? 'Como una pluma' : fpm <= 300 ? 'Correcto' : fpm <= 600 ? 'Duro' : 'Muy duro' });
  // 2. Eje de pista
  const off = Math.abs(L.across);
  const sC = Math.max(0, 1 - Math.pow(off / (a.width / 2), 1.3));
  parts.push({ label: 'Eje de pista', value: `${off.toFixed(1)} m`, score: sC, note: off < 1.5 ? 'Centrado' : off < a.width / 4 ? 'Aceptable' : 'Desviado' });
  // 3. Punto de contacto (desde el umbral de la cabecera usada)
  const d = L.fromThreshold;
  const zone0 = a.length > 1200 ? 150 : 60, zone1 = a.length > 1200 ? 500 : a.length * 0.33;
  let sZ;
  if (d < 0) sZ = 0; else if (d < zone0) sZ = 0.6 + 0.4 * (d / zone0);
  else if (d <= zone1) sZ = 1; else sZ = Math.max(0, 1 - (d - zone1) / (a.length * 0.45));
  parts.push({ label: 'Punto de contacto', value: `${Math.round(d)} m del umbral`, score: sZ, note: d < 0 ? 'Antes de la pista' : d <= zone1 ? 'En la zona' : 'Largo' });
  // 4. Alineación y velocidad
  const sA = Math.max(0, 1 - Math.abs(L.crab) / (12 * df.lenient));
  parts.push({ label: 'Alineación', value: `${Math.abs(L.crab).toFixed(1)}°`, score: sA, note: Math.abs(L.crab) < 3 ? 'Recto' : 'Cruzado' });
  const k = L.ias / KT;
  const sS = k < 42 ? 0.6 : k <= 62 ? 1 : Math.max(0, 1 - (k - 62) / 25);
  parts.push({ label: 'Velocidad', value: `${k.toFixed(0)} kt`, score: sS, note: k <= 62 ? 'Buena' : 'Rápido' });
  let total = 100 * (0.36 * sVs + 0.2 * sC + 0.2 * sZ + 0.12 * sA + 0.12 * sS);
  total -= (8 / df.lenient) * L.bounces;
  if (L.bounces) parts.push({ label: 'Botes', value: String(L.bounces), score: Math.max(0, 1 - L.bounces * 0.4), note: 'Recoge un poco menos' });
  total = Math.max(0, Math.min(100, total));
  const stars = total >= df.stars[0] ? 3 : total >= df.stars[1] ? 2 : total >= df.stars[2] ? 1 : 0;
  return { total: Math.round(total), stars, parts, fpm };
}

// Sigue el desarrollo de una misión: pasos, aterrizaje y resultado.
export class MissionRunner {
  constructor(game) {
    this.game = game;
    this.mission = null;
    this.step = 0;
    this.hold = 0;
    this.time = 0;
    this.state = 'idle';     // idle | running | landed | done | failed
    this.landing = null;     // datos de la toma en curso
    this.result = null;
    this.airTime = 0;
    this.wasAir = false;
    this.onUpdate = null;    // callback(texto, pista)
    this.onEnd = null;       // callback(resultado)
    this.onLanding = null;   // callback(score) en vuelo libre
    this._failed = false;
  }

  start(mission) {
    this.mission = mission;
    this.step = 0; this.hold = 0; this.time = 0;
    this.state = 'running';
    this.landing = null; this.result = null;
    // Las misiones que empiezan en vuelo cuentan como "en el aire" desde el principio.
    this.wasAir = !!(mission.start && (mission.start.air || mission.start.approach));
    this.airTime = this.wasAir ? 99 : 0;
    this._failed = false; this._engFailed = false;
    this._emit();
  }

  stop() { this.state = 'idle'; this.mission = null; }

  _emit() {
    const m = this.mission;
    if (!this.onUpdate || !m) return;
    if (m.steps && this.step < m.steps.length) {
      const s = m.steps[this.step];
      this.onUpdate(s.text, s.hint || null, this.step, m.steps.length);
    } else if (m.landing) {
      const a = ap(m.landing.airport);
      this.onUpdate(`Aterriza en ${a.name} (${a.id})`, null, this.step, (m.steps || []).length);
    } else this.onUpdate(m.free ? '' : m.title, null, 0, 0);
  }

  // Recibe los eventos de la física (toma de contacto, accidente...).
  onEvent(e) {
    if (this.state !== 'running' && this.state !== 'landed') return;
    const g = this.game, ac = g.ac;
    if (e.type === 'crash') {
      this.state = 'failed';
      this.result = { ok: false, reason: e.reason };
      if (this.onEnd) this.onEnd(this.result);
      return;
    }
    if (e.type === 'touch' && e.wheel !== 'morro') {
      // primera toma tras un tiempo en el aire -> registrar; si ya había toma, es un bote
      if (this.landing && this.airTime > 0.35 && !this.landing.settled) { this.landing.bounces++; this.landing.vs = Math.max(this.landing.vs, e.vs); }
      else if (!this.landing && this.airTime > 4) {
        const near = AIRPORTS.map((a) => ({ a, l: runwayLocal(a, ac.pos[0], ac.pos[2]) })).filter((o) => pavedAt(o.a, o.l[0], o.l[1]) === 1)[0];
        const tel = ac.tel;
        const L = { vs: e.vs, ias: tel.ias, bounces: 0, t: this.time, settled: false, onRunway: !!near, surface: e.surface };
        if (near) {
          const a = near.a, [al, acr] = near.l;
          // cabecera usada según el sentido de la marcha
          const along = ac.vel[0] * a.dir[0] + ac.vel[2] * a.dir[1];
          const end = along >= 0 ? 0 : 1;
          L.airport = a; L.end = end;
          L.across = acr; L.fromThreshold = end === 0 ? al + a.length / 2 : a.length / 2 - al;
          let crab = tel.heading - (end === 0 ? a.heading : a.heading + 180);
          crab = ((crab + 540) % 360) - 180;
          L.crab = crab;
        }
        this.landing = L;
      }
    }
  }

  update(dt) {
    const g = this.game, ac = g.ac, m = this.mission;
    if (!m || (this.state !== 'running' && this.state !== 'landed')) return;
    this.time += dt;
    if (ac.tel.onGround) this.airTime = 0; else this.airTime += dt;
    // fallo de motor programado
    if (m.engineFailAfter && !this._engFailed && this.time > m.engineFailAfter) {
      this._engFailed = true; ac.engine.failed = true;
      if (g.hud) g.hud.message('¡Fallo de motor!', 5, '#ff8a7a');
    }
    // pasos guiados
    if (m.steps && this.step < m.steps.length) {
      const s = m.steps[this.step];
      if (s.check(g)) { this.hold += dt; if (this.hold >= (s.hold || 0.25)) { this.step++; this.hold = 0; g.emit('stepDone', this.step); this._emit(); } }
      else this.hold = 0;
      if (this.step >= m.steps.length && !m.landing) {
        // misión de pasos completada
        this.result = { ok: true, text: m.done || '¡Misión cumplida!', total: 100, stars: 3, parts: [] };
        if (m.freeAfter) { if (g.hud) g.hud.message(this.result.text, 7, '#b8ffb0'); this.mission = { ...m, steps: null, free: true }; this._emit(); if (this.onEnd) this.onEnd({ ...this.result, soft: true }); }
        else { this.state = 'done'; if (this.onEnd) this.onEnd(this.result); }
        return;
      }
    }
    // toma de tierra en curso: esperar a que el avión se detenga o vuelva al aire
    const L = this.landing;
    if (L && !L.settled) {
      if (!ac.tel.onGround && this.airTime > 3.5) { this.landing = null; return; }   // motor y al aire
      const stopped = ac.tel.groundSpeed < 1.5 && ac.tel.onGround;
      const slow = ac.tel.groundSpeed < 12 && ac.tel.onGround && this.time - L.t > 4;
      if (stopped || (m.free && slow)) {
        L.settled = true;
        if (!L.onRunway) {
          if (m.free || !m.landing) { if (g.hud) g.hud.message(L.surface === 'asphalt' ? 'Aterrizaje fuera de pista' : 'Aterrizaje de campo: ¡estás entero!', 5); this.landing = null; return; }
          this.state = 'failed';
          this.result = { ok: false, reason: 'Has aterrizado fuera de la pista' };
          if (this.onEnd) this.onEnd(this.result);
          return;
        }
        const sc = scoreLanding(L, L.airport, DIFFICULTY[this.game.difficulty ?? 1]);
        sc.airport = L.airport;
        const [al, acr] = runwayLocal(L.airport, ac.pos[0], ac.pos[2]);
        sc.stoppedOnRunway = pavedAt(L.airport, al, acr) > 0;
        if (m.free || !m.landing) {
          if (this.onLanding) this.onLanding(sc);
          this.landing = null;
          return;
        }
        const target = m.landing.airport;
        if (!m.landing.any && L.airport.id !== target) {
          this.state = 'failed';
          this.result = { ok: false, reason: `Has aterrizado en ${L.airport.name}, no en ${ap(target).name}` };
        } else if (m.steps && this.step < m.steps.length) {
          this.state = 'failed';
          this.result = { ok: false, reason: 'Has aterrizado sin completar el circuito' };
        } else {
          this.state = 'done';
          this.result = { ok: true, ...sc, time: this.time };
        }
        if (this.onEnd) this.onEnd(this.result);
      }
    }
  }
}
