// Aeródromos de la isla. Coordenadas del mundo en metros (+X este, +Z sur); rumbo en grados.
// elev = cota de la pista; flat* = explanada nivelada en el mapa de alturas.
const DEG = Math.PI / 180;

export const AIRPORTS = [
  {
    id: 'HZPA', name: 'Puerto Aurora', x: 10024, z: 10824, heading: 70, length: 1600, width: 30, elev: 37,
    flatLen: 2150, flatWid: 520, blend: 520, lights: true, main: true, apronSide: -1,
  },
  {
    id: 'HZBN', name: 'Bahía Norte', x: 1624, z: -11576, heading: 100, length: 1000, width: 23, elev: 27,
    flatLen: 1400, flatWid: 300, blend: 420, lights: true, apronSide: 1,
  },
  {
    id: 'HZVA', name: 'Valle Alto', x: -6376, z: -5976, heading: 70, length: 720, width: 18, elev: 870,
    flatLen: 980, flatWid: 280, blend: 380, lights: false, apronSide: 1,
  },
  {
    id: 'HZIV', name: 'Isla del Volcán', x: 12424, z: -11176, heading: 0, length: 800, width: 20, elev: 20,
    flatLen: 1100, flatWid: 290, blend: 380, lights: false, apronSide: 1,
  },
];

// Tipos de zona pavimentada (además de la pista): 1 rodaje paralelo a pista, 2 rodaje transversal, 3 plataforma.
export const PAVED = { TAXI_ALONG: 1, TAXI_ACROSS: 2, APRON: 3 };
export const MAX_RECTS = 5;

for (const a of AIRPORTS) {
  const h = a.heading * DEG;
  a.dir = [Math.sin(h), -Math.cos(h)];          // sentido del rumbo de pista (xz)
  a.right = [Math.cos(h), Math.sin(h)];         // a la derecha mirando en ese rumbo
  const n1 = Math.round(a.heading / 10) || 36, n2 = ((n1 + 17) % 36) + 1;
  a.numbers = [String(n1).padStart(2, '0'), String(n2).padStart(2, '0')];
  // Zonas pavimentadas en coordenadas locales: [centro along, centro across, semilargo along, semiancho across, tipo]
  const s = a.apronSide, hw = a.width / 2;
  if (a.main) {
    a.paved = [
      [0, s * 95, 660, 9, PAVED.TAXI_ALONG],
      [-640, s * (hw + 36), 9, 36 + 2, PAVED.TAXI_ACROSS],
      [0, s * (hw + 36), 9, 36 + 2, PAVED.TAXI_ACROSS],
      [640, s * (hw + 36), 9, 36 + 2, PAVED.TAXI_ACROSS],
      [0, s * 160, 170, 56, PAVED.APRON],
    ];
    a.apron = { along: 0, across: s * 160, halfAlong: 170, halfAcross: 56 };
  } else {
    a.paved = [
      [0, s * (hw + 26), 7, 26 + 2, PAVED.TAXI_ACROSS],
      [0, s * (hw + 52 + 28), 62, 28, PAVED.APRON],
    ];
    a.apron = { along: 0, across: s * (hw + 80), halfAlong: 62, halfAcross: 28 };
  }
}

// ¿Está (along, across) sobre pavimento? Devuelve 0 (no), 1 pista, 2 rodaje/plataforma.
export function pavedAt(a, al, ac) {
  if (Math.abs(al) < a.length / 2 + 55 && Math.abs(ac) < a.width / 2) return 1;
  for (const r of a.paved) if (Math.abs(al - r[0]) < r[2] && Math.abs(ac - r[1]) < r[3]) return 2;
  return 0;
}

// Coordenadas locales de pista: along (a lo largo del rumbo, 0 en el centro), across (+ a la derecha).
export function runwayLocal(a, x, z) {
  const dx = x - a.x, dz = z - a.z;
  return [dx * a.dir[0] + dz * a.dir[1], dx * a.right[0] + dz * a.right[1]];
}
export function runwayPoint(a, along, across = 0) {
  return [a.x + a.dir[0] * along + a.right[0] * across, a.z + a.dir[1] * along + a.right[1] * across];
}
// Umbral de la cabecera de aproximación en el rumbo indicado (0 = rumbo de pista, 1 = recíproco).
export function runwayEnd(a, end) {
  const s = end === 0 ? -1 : 1;
  const [x, z] = runwayPoint(a, (s * a.length) / 2);
  return { x, z, heading: end === 0 ? a.heading : (a.heading + 180) % 360, number: a.numbers[end] };
}
export function nearestAirport(x, z) {
  let best = null, bd = 1e12;
  for (const a of AIRPORTS) { const d = Math.hypot(x - a.x, z - a.z); if (d < bd) { bd = d; best = a; } }
  return { airport: best, dist: bd };
}
