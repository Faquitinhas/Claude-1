// Modelo 3D procedural del avión (monomotor de ala alta). Todo se genera por código:
// fuselaje por secciones (superelipses), alas y cola con perfiles NACA, tren, hélice
// y superficies de mando como piezas móviles con su eje de giro.
//
// Ejes cuerpo: +X ala derecha, +Y arriba, +Z cola. Origen en el centro de gravedad.
// Formato de vértice (12 floats): posición(3) normal(3) color(3) rugosidad, metal, material.
const DEG = Math.PI / 180;

export const MAT = { PAINT: 0, GLASS: 1, METAL: 2, RUBBER: 3, DARK: 4, PROP: 5, LIGHT_RED: 6, LIGHT_GREEN: 7, LIGHT_WHITE: 8, FUSELAGE: 9, TAIL: 10, WING: 11, INTERIOR: 12, PANEL: 13 };

// Tablero de instrumentos (rectángulo en ejes cuerpo): esquina inferior izquierda, ancho, alto e inclinación.
export const PANEL = { x0: -0.52, y0: -0.12, z0: -0.80, w: 1.04, h: 0.447, tilt: 0.09 };

const WHITE = [0.80, 0.80, 0.78];

class Builder {
  constructor() { this.data = []; this.parts = {}; this.cur = null; this.count = 0; }
  part(name, pivot = [0, 0, 0], axis = [1, 0, 0]) {
    this.cur = this.parts[name] || (this.parts[name] = { name, ranges: [], pivot, axis });
    return this.cur;
  }
  vert(p, n, col, m) {
    this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], m[0], m[1], m[2]);
    this.count++;
  }
  tri(a, b, c, na, nb, nc, col, m) {
    const start = this.count;
    this.vert(a, na, col, m); this.vert(b, nb, col, m); this.vert(c, nc, col, m);
    this._range(start, 3);
  }
  _range(start, n) {
    const r = this.cur.ranges;
    if (r.length && r[r.length - 1][0] + r[r.length - 1][1] === start) r[r.length - 1][1] += n;
    else r.push([start, n]);
  }
  // Malla lofteada: rows[i][j] = punto. closed: cierra el contorno en j. matFn(i, j) -> {col, m} opcional.
  loft(rows, { closed = true, col = WHITE, m = [0.35, 0, MAT.PAINT], matFn = null, flip = false, capStart = false, capEnd = false, filter = null } = {}) {
    const R = rows.length, C = rows[0].length;
    const idx = (j) => (closed ? ((j % C) + C) % C : Math.max(0, Math.min(C - 1, j)));
    const nrm = [];
    for (let i = 0; i < R; i++) {
      nrm.push([]);
      for (let j = 0; j < C; j++) {
        const pu0 = rows[i][idx(j - 1)], pu1 = rows[i][idx(j + 1)];
        const pv0 = rows[Math.max(0, i - 1)][j], pv1 = rows[Math.min(R - 1, i + 1)][j];
        const du = sub(pu1, pu0), dv = sub(pv1, pv0);
        let n = cross(du, dv);
        const l = len(n);
        n = l > 1e-9 ? scale(n, 1 / l) : [0, 1, 0];
        nrm[i].push(n);
      }
    }
    // Orientación hacia fuera: comparar con la dirección desde el centroide de la sección.
    let s = 0;
    for (let i = 0; i < R; i++) {
      const c = centroid(rows[i]);
      for (let j = 0; j < C; j++) s += dot(nrm[i][j], sub(rows[i][j], c));
    }
    const sign = (s < 0 ? -1 : 1) * (flip ? -1 : 1);
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) nrm[i][j] = scale(nrm[i][j], sign);
    const JN = closed ? C : C - 1;
    for (let i = 0; i < R - 1; i++) {
      for (let j = 0; j < JN; j++) {
        const j1 = idx(j + 1);
        const a = rows[i][j], b = rows[i][j1], c = rows[i + 1][j1], d = rows[i + 1][j];
        const na = nrm[i][j], nb = nrm[i][j1], nc = nrm[i + 1][j1], nd = nrm[i + 1][j];
        if (filter && !filter(i, j)) continue;
        let mm = m, cc = col;
        if (matFn) { const r = matFn(i, j, a, b, c, d); if (r) { mm = r.m || m; cc = r.col || col; } }
        // orden de vértices coherente con la normal exterior
        const fn = cross(sub(b, a), sub(d, a));
        const out = dot(fn, add(add(na, nb), add(nc, nd))) >= 0;   // coherente con la normal (ya volteada si flip)
        if (out) { this.tri(a, b, c, na, nb, nc, cc, mm); this.tri(a, c, d, na, nc, nd, cc, mm); }
        else { this.tri(a, c, b, na, nc, nb, cc, mm); this.tri(a, d, c, na, nd, nc, cc, mm); }
      }
    }
    if (capStart) this.cap(rows[0], col, m, scale(sub(centroid(rows[0]), centroid(rows[1])), 1));
    if (capEnd) this.cap(rows[R - 1], col, m, sub(centroid(rows[R - 1]), centroid(rows[R - 2])));
  }
  // Tapa plana (abanico) de un contorno, con normal orientada según 'dir'.
  cap(loop, col, m, dir) {
    const c = centroid(loop);
    let n = [0, 0, 0];
    for (let j = 0; j < loop.length; j++) n = add(n, cross(sub(loop[j], c), sub(loop[(j + 1) % loop.length], c)));
    n = norm(n);
    const flip = dot(n, dir) < 0;
    if (flip) n = scale(n, -1);
    for (let j = 0; j < loop.length; j++) {
      const a = loop[j], b = loop[(j + 1) % loop.length];
      if (flip) this.tri(c, b, a, n, n, n, col, m); else this.tri(c, a, b, n, n, n, col, m);
    }
  }
  // Superficie de revolución alrededor de un eje (perfil = [[r, t]...], t a lo largo del eje).
  revolve(center, axis, profile, { seg = 20, col = WHITE, m = [0.4, 0, MAT.PAINT] } = {}) {
    const ax = norm(axis);
    const u = norm(Math.abs(ax[1]) < 0.9 ? cross(ax, [0, 1, 0]) : cross(ax, [1, 0, 0]));
    const v = cross(ax, u);
    const rows = profile.map(([r, t]) => {
      const row = [];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * 2 * Math.PI;
        row.push(add(add(center, scale(ax, t)), add(scale(u, r * Math.cos(a)), scale(v, r * Math.sin(a)))));
      }
      return row;
    });
    this.loft(rows, { closed: true, col, m });
  }
  // Tubo entre dos puntos con sección elíptica (a lo largo de 'wide').
  tube(p0, p1, r0, r1, { seg = 10, col = WHITE, m = [0.4, 0, MAT.PAINT], wide = null, flat = 1, caps = true } = {}) {
    const ax = norm(sub(p1, p0));
    let u = wide ? norm(sub(wide, scale(ax, dot(wide, ax)))) : norm(Math.abs(ax[1]) < 0.9 ? cross(ax, [0, 1, 0]) : cross(ax, [1, 0, 0]));
    const v = cross(ax, u);
    const ring = (p, r) => {
      const row = [];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * 2 * Math.PI;
        row.push(add(p, add(scale(u, r * Math.cos(a)), scale(v, r * flat * Math.sin(a)))));
      }
      return row;
    };
    this.loft([ring(p0, r0), ring(p1, r1)], { closed: true, col, m, capStart: caps, capEnd: caps });
  }
  finish() { return { vertices: new Float32Array(this.data), parts: this.parts, count: this.count }; }
}

// --- álgebra vectorial mínima ---
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function centroid(loop) { let c = [0, 0, 0]; for (const p of loop) c = add(c, p); return scale(c, 1 / loop.length); }

// Perfil NACA de 4 dígitos. Devuelve {upper(u), lower(u)} con u en [0,1] (cuerda unitaria).
function naca(m, p, t) {
  const yt = (x) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  const yc = (x) => (m === 0 ? 0 : x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x));
  return { upper: (x) => yc(x) + yt(x), lower: (x) => yc(x) - yt(x) };
}
// Muestras de cuerda con espaciado coseno, incluyendo opcionalmente un punto exacto (bisagra).
function chordSamples(n, from = 0, to = 1) {
  const s = [];
  for (let i = 0; i <= n; i++) {
    const c = 0.5 * (1 - Math.cos((i / n) * Math.PI));
    s.push(from + (to - from) * c);
  }
  return s;
}

// Sección de ala en la envergadura: devuelve la transformación (u, v) -> punto del cuerpo.
function wingFrame(pos, chord, incDeg, spanAxis) {
  // spanAxis: 'x' (ala/estabilizador) o 'y' (deriva). pos = punto del cuarto de cuerda.
  const i = incDeg * DEG, c = Math.cos(i), s = Math.sin(i);
  return (u, v) => {
    const du = (u - 0.25) * chord, dv = v * chord;
    if (spanAxis === 'y') return [pos[0] + dv, pos[1], pos[2] + du];
    return [pos[0], pos[1] - du * s + dv * c, pos[2] + du * c + dv * s];
  };
}

export function buildAircraft() {
  const B = new Builder();
  const blue = [0.015, 0.07, 0.30], red = [0.50, 0.02, 0.02];

  // ================= FUSELAJE =================
  B.part('body');
  const NU = 36;
  const st = [
    // z, semiancho, y centro, alto arriba, alto abajo, exp arriba, exp abajo
    [-1.92, 0.20, -0.03, 0.19, 0.21, 2.2, 2.2],
    [-1.88, 0.36, -0.03, 0.29, 0.33, 2.4, 2.6],
    [-1.76, 0.45, -0.03, 0.335, 0.40, 2.6, 3.0],
    [-1.50, 0.50, -0.03, 0.35, 0.45, 2.8, 3.2],
    [-1.02, 0.53, -0.03, 0.365, 0.52, 2.8, 3.4],
    [-0.98, 0.535, -0.03, 0.375, 0.53, 2.8, 3.4],   // base del parabrisas
    [-0.80, 0.54, 0.03, 0.56, 0.60, 2.9, 3.5],
    [-0.62, 0.545, 0.08, 0.70, 0.68, 3.2, 3.6],
    [-0.50, 0.55, 0.10, 0.725, 0.70, 3.4, 3.6],      // poste delantero / borde de ataque
    [-0.42, 0.55, 0.10, 0.725, 0.70, 3.4, 3.6],
    [0.34, 0.555, 0.10, 0.725, 0.70, 3.4, 3.6],      // poste central
    [0.44, 0.555, 0.10, 0.725, 0.70, 3.4, 3.6],
    [1.10, 0.53, 0.10, 0.725, 0.68, 3.4, 3.4],       // poste trasero
    [1.20, 0.52, 0.10, 0.72, 0.66, 3.3, 3.4],
    [1.50, 0.47, 0.11, 0.60, 0.60, 3.0, 3.2],
    [1.78, 0.42, 0.12, 0.47, 0.55, 2.8, 3.0],        // fin de la luneta
    [2.40, 0.33, 0.15, 0.34, 0.44, 2.6, 2.8],
    [3.20, 0.23, 0.18, 0.25, 0.32, 2.4, 2.6],
    [4.20, 0.14, 0.21, 0.17, 0.20, 2.2, 2.4],
    [5.10, 0.07, 0.23, 0.10, 0.10, 2.0, 2.0],
    [5.55, 0.02, 0.23, 0.03, 0.03, 2.0, 2.0],
  ];
  const pw = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), 2 / e);
  const section = (s) => {
    const row = [];
    for (let j = 0; j < NU; j++) {
      const th = (j / NU) * 2 * Math.PI;
      const sn = Math.sin(th), cs = Math.cos(th);
      const e = cs >= 0 ? s[5] : s[6];
      row.push([s[1] * pw(sn, e), s[2] + (cs >= 0 ? s[3] : s[4]) * pw(cs, e), s[0]]);
    }
    return row;
  };
  const rows = st.map(section);
  // Ventanas: por índice de estación (i) y columna angular (j). j=0 arriba, 9 = costado derecho.
  const sideCol = (j) => { const k = j > NU / 2 ? NU - j : j; return k; }; // distancia angular desde arriba
  const glass = { m: [0.06, 0, MAT.GLASS], col: [0.02, 0.025, 0.03] };
  const fusePaint = { m: [0.32, 0, MAT.FUSELAGE], col: WHITE };
  const isGlass = (i, j) => {
    const k = sideCol(j + 0.5);
    if (i >= 5 && i < 8 && k < 8.2) return true;                                       // parabrisas
    if (((i >= 9 && i < 10) || (i >= 11 && i < 12)) && k > 4.2 && k < 8.2) return true; // ventanillas
    if (i >= 13 && i < 15 && k < 7.2 && k > 1.2) return true;                           // luneta trasera
    return false;
  };
  B.loft(rows, {
    closed: true, col: WHITE, m: [0.32, 0, MAT.FUSELAGE], capStart: true,
    filter: (i, j) => !isGlass(i, j),
    matFn: (i, j) => {
      const k = sideCol(j + 0.5);
      // panel antirreflejos sobre el capó
      if (i >= 2 && i < 5 && k < 2.2) return { m: [0.75, 0, MAT.DARK], col: [0.03, 0.03, 0.035] };
      return fusePaint;
    },
  });
  // Cristales: pieza aparte (no proyectan sombra, dejan entrar el sol en la cabina).
  B.part('glass');
  B.loft(rows, { closed: true, ...glass, filter: isGlass });
  B.part('body');
  // Tomas de aire del capó (dos óvalos oscuros) y tubo de escape
  for (const sx of [-1, 1]) {
    B.tube([sx * 0.2, 0.06, -1.925], [sx * 0.2, 0.06, -1.86], 0.085, 0.085, { seg: 12, col: [0.01, 0.01, 0.01], m: [0.9, 0, MAT.DARK], flat: 0.6 });
  }
  B.tube([0.22, -0.44, -1.35], [0.25, -0.60, -1.22], 0.028, 0.028, { seg: 8, col: [0.12, 0.11, 0.10], m: [0.5, 0.9, MAT.METAL] });

  // ================= ALA =================
  const WING_Y = 0.86, WING_ZQ = -0.06, DIH = Math.tan(1.73 * DEG);
  const chordAt = (x) => (x <= 2.5 ? 1.63 : lerp(1.63, 1.13, (x - 2.5) / 3.0));
  const incAt = (x) => lerp(1.5, -1.5, x / 5.5);
  const wingAF = naca(0.02, 0.4, 0.12);
  const wingPt = (side, x, u, v) => {
    const c = chordAt(x);
    const f = wingFrame([side * x, WING_Y + x * DIH, WING_ZQ], c, incAt(x), 'x');
    return f(u, v);
  };
  const NC = 14;
  // Contorno completo (extradós TE->LE, intradós LE->TE)
  const fullLoop = (side, x, sc = 1, vShift = 0) => {
    const us = chordSamples(NC);
    const loop = [];
    for (let k = NC; k >= 0; k--) loop.push(wingPt(side, x, us[k], wingAF.upper(us[k]) * sc + vShift));
    for (let k = 1; k <= NC; k++) loop.push(wingPt(side, x, us[k], wingAF.lower(us[k]) * sc + vShift));
    return loop;
  };
  // Cajón fijo hasta la bisagra hf (cerrado por detrás)
  const boxLoop = (side, x, hf) => {
    const us = chordSamples(NC, 0, hf);
    const loop = [];
    for (let k = NC; k >= 0; k--) loop.push(wingPt(side, x, us[k], wingAF.upper(us[k])));
    for (let k = 1; k <= NC; k++) loop.push(wingPt(side, x, us[k], wingAF.lower(us[k])));
    return loop;
  };
  // Superficie móvil desde la bisagra hasta el borde de salida (con morro redondeado)
  const ctlLoop = (ptFn, af, hf, gap = 0.012) => {
    const us = chordSamples(8, hf + gap, 1);
    const loop = [];
    for (let k = 8; k >= 0; k--) loop.push(ptFn(us[k], af.upper(us[k])));
    // morro: semicírculo entre extradós e intradós en hf+gap
    const yu = af.upper(hf + gap), yl = af.lower(hf + gap), r = (yu - yl) / 2, yc = (yu + yl) / 2;
    for (let k = 1; k < 5; k++) { const a = (k / 5) * Math.PI; loop.push(ptFn(hf + gap - r * Math.sin(a) * 0.9, yc + r * Math.cos(a))); }
    for (let k = 0; k <= 8; k++) loop.push(ptFn(us[k], af.lower(us[k])));
    return loop;
  };
  const wingMat = { col: WHITE, m: [0.32, 0, MAT.WING] };
  const FLAP_H = 0.72, AIL_H = 0.76;
  for (const side of [1, -1]) {
    B.part('body');
    // tramo central (sobre la cabina) y raíz
    B.loft([fullLoop(side, 0), fullLoop(side, 0.56)], { ...wingMat, closed: true, capEnd: true });
    // tramo de flap
    B.loft([boxLoop(side, 0.56, FLAP_H), boxLoop(side, 1.5, FLAP_H), boxLoop(side, 2.5, FLAP_H), boxLoop(side, 3.0, FLAP_H)], { ...wingMat, closed: true });
    // tramo de alerón
    B.loft([boxLoop(side, 3.0, AIL_H), boxLoop(side, 4.0, AIL_H), boxLoop(side, 5.3, AIL_H)], { ...wingMat, closed: true, capStart: true });
    // punta redondeada
    B.loft([fullLoop(side, 5.3), fullLoop(side, 5.40), fullLoop(side, 5.47, 0.72, 0.004), fullLoop(side, 5.50, 0.25, 0.008)], { ...wingMat, closed: true, capStart: true, capEnd: true });
    // flap
    const fName = side > 0 ? 'flapR' : 'flapL';
    const hA = wingPt(side, 0.58, FLAP_H, (wingAF.upper(FLAP_H) + wingAF.lower(FLAP_H)) / 2);
    const hB = wingPt(side, 2.98, FLAP_H, (wingAF.upper(FLAP_H) + wingAF.lower(FLAP_H)) / 2);
    B.part(fName, hA, norm(sub(hB, hA)));
    B.loft([0.58, 1.5, 2.5, 2.98].map((x) => ctlLoop((u, v) => wingPt(side, x, u, v), wingAF, FLAP_H)), { ...wingMat, closed: true, capStart: true, capEnd: true });
    // alerón
    const aName = side > 0 ? 'aileronR' : 'aileronL';
    const aA = wingPt(side, 3.02, AIL_H, (wingAF.upper(AIL_H) + wingAF.lower(AIL_H)) / 2);
    const aB = wingPt(side, 5.28, AIL_H, (wingAF.upper(AIL_H) + wingAF.lower(AIL_H)) / 2);
    B.part(aName, aA, norm(sub(aB, aA)));
    B.loft([3.02, 4.0, 5.28].map((x) => ctlLoop((u, v) => wingPt(side, x, u, v), wingAF, AIL_H)), { ...wingMat, closed: true, capStart: true, capEnd: true });
    // montante del ala
    B.part('body');
    B.tube([side * 0.50, -0.50, 0.02], [side * 2.55, WING_Y + 2.55 * DIH - 0.07, 0.05], 0.085, 0.07, { seg: 10, col: WHITE, m: [0.32, 0, MAT.PAINT], wide: [0, 0, 1], flat: 0.32 });
    // luces de navegación en las puntas
    const tip = wingPt(side, 5.47, 0.3, 0.02);
    B.tube(add(tip, [side * 0.0, 0, -0.05]), add(tip, [side * 0.05, 0, 0.05]), 0.03, 0.02, { seg: 6, col: side > 0 ? [0.05, 0.9, 0.2] : [0.9, 0.05, 0.03], m: [0.3, 0, side > 0 ? MAT.LIGHT_GREEN : MAT.LIGHT_RED] });
  }
  // tubo pitot bajo el ala izquierda
  B.part('body');
  {
    const p = wingPt(-1, 3.4, 0.25, -0.08);
    B.tube(p, add(p, [0, -0.09, -0.02]), 0.012, 0.012, { seg: 6, col: [0.5, 0.5, 0.5], m: [0.4, 1, MAT.METAL] });
    B.tube(add(p, [0, -0.09, 0.0]), add(p, [0, -0.09, -0.22]), 0.011, 0.008, { seg: 6, col: [0.5, 0.5, 0.5], m: [0.4, 1, MAT.METAL] });
  }

  // ================= ESTABILIZADOR HORIZONTAL =================
  const hAF = naca(0, 0.4, 0.09);
  const HT_Y = 0.20, HT_SPAN = 1.725, EL_H = 0.58;
  const htChord = (x) => lerp(1.28, 0.74, x / HT_SPAN);
  const htPt = (side, x, u, v) => {
    const c = htChord(x);
    const zq = 3.92 + 0.25 * 1.28 + x * 0.16; // flecha leve
    return wingFrame([side * x, HT_Y, zq], c, -1.9, 'x')(u, v);
  };
  const tailMat = { col: WHITE, m: [0.32, 0, MAT.TAIL] };
  for (const side of [1, -1]) {
    B.part('body');
    const box = (x) => {
      const us = chordSamples(10, 0, EL_H), loop = [];
      for (let k = 10; k >= 0; k--) loop.push(htPt(side, x, us[k], hAF.upper(us[k])));
      for (let k = 1; k <= 10; k++) loop.push(htPt(side, x, us[k], hAF.lower(us[k])));
      return loop;
    };
    const full = (x, sc) => {
      const us = chordSamples(10), loop = [];
      for (let k = 10; k >= 0; k--) loop.push(htPt(side, x, us[k], hAF.upper(us[k]) * sc));
      for (let k = 1; k <= 10; k++) loop.push(htPt(side, x, us[k], hAF.lower(us[k]) * sc));
      return loop;
    };
    B.loft([box(0), box(0.9), box(1.62)], { ...tailMat, closed: true });
    B.loft([full(1.62, 1), full(1.69, 0.8), full(1.725, 0.3)], { ...tailMat, closed: true, capStart: true, capEnd: true });
  }
  {
    // timón de profundidad (una sola pieza que une ambos lados)
    const hA = htPt(-1, 1.6, EL_H, 0), hB = htPt(1, 1.6, EL_H, 0);
    B.part('elevator', [0, hA[1], (hA[2] + htPt(1, 0.05, EL_H, 0)[2]) / 2], [1, 0, 0]);
    for (const side of [1, -1]) {
      B.loft([0.08, 0.9, 1.6].map((x) => ctlLoop((u, v) => htPt(side, x, u, v), hAF, EL_H, 0.014)), { ...tailMat, closed: true, capStart: true, capEnd: true });
    }
    B.parts.elevator.pivot = lerp3(htPt(1, 0.08, EL_H, 0), htPt(1, 1.6, EL_H, 0), 0.5);
    B.parts.elevator.pivot[0] = 0;
    // eje de bisagra aproximado (perpendicular al plano de simetría)
    B.parts.elevator.axis = [1, 0, 0];
    void hB;
  }

  // ================= DERIVA =================
  const vAF = naca(0, 0.4, 0.085);
  const RUD_H = 0.6;
  const vtChord = (y) => lerp(1.62, 0.74, (y - 0.3) / 1.68);
  const vtPt = (y, u, v) => {
    const c = vtChord(y);
    const zLE = 3.42 + (y - 0.3) * 0.74;
    return [v * c, y, zLE + u * c];
  };
  B.part('body');
  {
    const box = (y, sc = 1) => {
      const us = chordSamples(10, 0, RUD_H), loop = [];
      for (let k = 10; k >= 0; k--) loop.push(vtPt(y, us[k], vAF.upper(us[k]) * sc));
      for (let k = 1; k <= 10; k++) loop.push(vtPt(y, us[k], vAF.lower(us[k]) * sc));
      return loop;
    };
    const full = (y, sc) => {
      const us = chordSamples(10), loop = [];
      for (let k = 10; k >= 0; k--) loop.push(vtPt(y, us[k], vAF.upper(us[k]) * sc));
      for (let k = 1; k <= 10; k++) loop.push(vtPt(y, us[k], vAF.lower(us[k]) * sc));
      return loop;
    };
    B.loft([box(0.25), box(1.0), box(1.84)], { ...tailMat, closed: true });
    B.loft([full(1.84, 1), full(1.93, 0.75), full(1.98, 0.25)], { ...tailMat, closed: true, capStart: true, capEnd: true });
    // aleta dorsal
    const d0 = [0, 0.50, 2.35], d1 = vtPt(0.95, 0.02, 0), d2 = [0, 0.38, 3.75];
    for (const sx of [-1, 1]) {
      const n = [sx, 0.15, 0];
      const a = add(d0, [sx * 0.004, 0, 0]), b = add(d1, [sx * 0.012, 0, 0]), c = add(d2, [sx * 0.03, 0, 0]);
      if (sx > 0) B.tri(a, b, c, n, n, n, WHITE, [0.32, 0, MAT.TAIL]); else B.tri(a, c, b, n, n, n, WHITE, [0.32, 0, MAT.TAIL]);
    }
    // baliza anticolisión en lo alto de la deriva
    B.tube([0, 1.97, 4.95], [0, 2.05, 4.95], 0.03, 0.022, { seg: 8, col: [0.9, 0.05, 0.03], m: [0.3, 0, MAT.LIGHT_RED] });
  }
  {
    const hA = vtPt(0.42, RUD_H, 0), hB = vtPt(1.82, RUD_H, 0);
    B.part('rudder', hA, norm(sub(hB, hA)));
    B.loft([0.42, 1.1, 1.82].map((y) => ctlLoop((u, v) => vtPt(y, u, v), vAF, RUD_H, 0.014)), { ...tailMat, closed: true, capStart: true, capEnd: true });
    // luz de cola
    B.tube([0, 0.62, 5.52], [0, 0.62, 5.56], 0.02, 0.015, { seg: 6, col: [1, 1, 1], m: [0.3, 0, MAT.LIGHT_WHITE] });
  }

  // ================= TREN DE ATERRIZAJE =================
  const tire = [0.02, 0.02, 0.022], rim = [0.55, 0.55, 0.55];
  const wheel = (name, c, R, w) => {
    B.part(name, c, [1, 0, 0]);
    const prof = [];
    // neumático: sección redondeada
    const rr = w / 2;
    for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + (k / 10) * Math.PI; prof.push([R - rr + rr * Math.cos(a), rr * Math.sin(a) * 1.0]); }
    B.revolve(c, [1, 0, 0], [[R * 0.52, -rr * 0.9], ...prof, [R * 0.52, rr * 0.9]], { seg: 22, col: tire, m: [0.85, 0, MAT.RUBBER] });
    // llanta
    B.revolve(c, [1, 0, 0], [[0.001, -rr * 0.75], [R * 0.5, -rr * 0.8], [R * 0.54, -rr * 0.5], [R * 0.54, rr * 0.5], [R * 0.5, rr * 0.8], [0.001, rr * 0.75]], { seg: 16, col: rim, m: [0.35, 0.9, MAT.METAL] });
  };
  for (const side of [1, -1]) {
    const c = [side * 1.27, -0.98, 0.44];
    wheel(side > 0 ? 'wheelR' : 'wheelL', c, 0.21, 0.15);
    // ballesta (pata) solidaria a la rueda en su extremo: se dibuja con la pieza 'legR/L'
    B.part(side > 0 ? 'legR' : 'legL', [side * 0.42, -0.56, 0.44], [0, 0, 1]);
    const p0 = [side * 0.42, -0.56, 0.44], p1 = [side * 1.16, -0.96, 0.44];
    B.tube(p0, p1, 0.10, 0.065, { seg: 8, col: WHITE, m: [0.32, 0, MAT.PAINT], wide: [0, 0, 1], flat: 0.22 });
    B.tube(p1, [side * 1.22, -0.98, 0.44], 0.03, 0.03, { seg: 8, col: rim, m: [0.4, 0.9, MAT.METAL] });
  }
  wheel('wheelN', [0, -1.01, -1.22], 0.18, 0.13);
  B.part('strutN', [0, -0.42, -1.22], [0, 1, 0]);
  B.tube([0, -0.42, -1.22], [0, -0.74, -1.22], 0.038, 0.038, { seg: 10, col: WHITE, m: [0.32, 0, MAT.PAINT] });
  B.part('forkN', [0, -1.01, -1.22], [0, 1, 0]);
  B.tube([0, -0.66, -1.22], [0, -0.80, -1.22], 0.024, 0.024, { seg: 10, col: [0.7, 0.7, 0.72], m: [0.15, 1, MAT.METAL] });
  for (const sx of [-1, 1]) {
    B.tube([sx * 0.085, -0.80, -1.22], [sx * 0.085, -1.01, -1.22], 0.018, 0.018, { seg: 6, col: WHITE, m: [0.32, 0, MAT.PAINT] });
  }
  B.tube([-0.095, -0.80, -1.22], [0.095, -0.80, -1.22], 0.022, 0.022, { seg: 6, col: WHITE, m: [0.32, 0, MAT.PAINT] });

  // ================= HÉLICE =================
  const HUB = [0, -0.03, -1.94];
  B.part('spinner', HUB, [0, 0, 1]);
  {
    const prof = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; prof.push([0.165 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2.2))) , -0.30 + 0.30 * t]); }
    prof[0][0] = 0.002;
    B.revolve(HUB, [0, 0, 1], [...prof, [0.165, 0.035]], { seg: 20, col: [0.75, 0.75, 0.77], m: [0.22, 1, MAT.METAL] });
  }
  B.part('prop', HUB, [0, 0, 1]);
  {
    const bladeAF = naca(0.03, 0.4, 0.09);
    const PITCH = 1.45, RT = 0.9525;
    for (const sgn of [1, -1]) {
      const secs = [];
      const NR = 9;
      for (let i = 0; i <= NR; i++) {
        const t = i / NR;
        const r = lerp(0.13, RT, t);
        const ch = 0.085 + 0.085 * Math.sin(Math.min(t * 1.5, 1) * Math.PI * 0.5) * (1 - 0.72 * Math.pow(t, 3)) - 0.03 * t;
        const th = lerp(0.2, 0.05, Math.pow(t, 0.6)) / 0.09; // factor de espesor
        const beta = Math.atan(PITCH / (2 * Math.PI * Math.max(r, 0.22)));
        const us = chordSamples(6), loop = [];
        const pt = (u, v) => {
          // cuerda girada 'beta' respecto al plano de rotación; la pala va en ±Y
          const a = (u - 0.4) * ch, b = v * ch * th;
          const tx = a * Math.cos(beta) + b * Math.sin(beta);   // dirección tangencial
          const tz = -a * Math.sin(beta) * -1 + b * Math.cos(beta) * -1; // axial (hacia delante = -Z)
          return [HUB[0] + sgn * tx, HUB[1] + sgn * r, HUB[2] + tz * 1];
        };
        for (let k = 6; k >= 0; k--) loop.push(pt(us[k], bladeAF.upper(us[k])));
        for (let k = 1; k <= 6; k++) loop.push(pt(us[k], bladeAF.lower(us[k])));
        secs.push(loop);
      }
      B.loft(secs, {
        closed: true, col: [0.02, 0.02, 0.022], m: [0.45, 0, MAT.PROP], capEnd: true,
        matFn: (i) => (i >= NR - 1 ? { col: [0.75, 0.6, 0.05], m: [0.45, 0, MAT.PROP] } : null), // puntas amarillas
      });
    }
  }
  // disco translúcido para la hélice girando (se dibuja aparte con mezcla)
  B.part('propDisc', HUB, [0, 0, 1]);
  {
    const seg = 40, R0 = 0.16, R1 = 0.9525, n = [0, 0, -1];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 2 * Math.PI, a1 = ((k + 1) / seg) * 2 * Math.PI;
      const p = (a, r) => [HUB[0] + r * Math.cos(a), HUB[1] + r * Math.sin(a), HUB[2] + 0.0];
      const m = [0.5, 0, MAT.PROP], c = [0.03, 0.03, 0.03];
      B.tri(p(a0, R0), p(a0, R1), p(a1, R1), n, n, n, c, m);
      B.tri(p(a0, R0), p(a1, R1), p(a1, R0), n, n, n, c, m);
    }
  }

  // ================= DETALLES =================
  B.part('body');
  // antenas
  B.tube([0, 0.83, 0.75], [0, 1.18, 0.95], 0.012, 0.006, { seg: 5, col: [0.85, 0.85, 0.85], m: [0.4, 0, MAT.PAINT] });
  B.tube([0.12, 0.82, 0.2], [0.12, 0.98, 0.28], 0.02, 0.012, { seg: 5, col: [0.85, 0.85, 0.85], m: [0.4, 0, MAT.PAINT], flat: 0.3, wide: [0, 0, 1] });
  // faro de aterrizaje en el capó
  B.tube([0, -0.30, -1.90], [0, -0.30, -1.93], 0.05, 0.05, { seg: 10, col: [1, 1, 0.95], m: [0.2, 0, MAT.LIGHT_WHITE] });

  // ================= INTERIOR DE CABINA =================
  B.part('cockpit');
  {
    const IN = MAT.INTERIOR;
    const dark = [0.10, 0.098, 0.094], grey = [0.26, 0.255, 0.25], liner = [0.46, 0.45, 0.42], carpet = [0.045, 0.043, 0.042];
    // Forro interior: copia del fuselaje desplazada hacia dentro, con normales invertidas y sin ventanas.
    const i0 = 4, i1 = 15;
    const inner = [];
    for (let i = i0; i <= i1; i++) {
      const c = [0, st[i][2], st[i][0]];
      inner.push(rows[i].map((p) => { const d = sub(c, p), l = len(d); return add(p, scale(d, 0.028 / l)); }));
    }
    B.loft(inner, {
      closed: true, flip: true, col: grey, m: [0.9, 0, IN],
      filter: (i, j) => !isGlass(i + i0, j),
      matFn: (i, j) => {
        const k = sideCol(j + 0.5);
        if (k < 4.2) return { col: liner, m: [0.95, 0, IN] };           // techo
        if (k < 8.2) return { col: [0.26, 0.255, 0.245], m: [0.8, 0, IN] }; // montantes entre ventanas
        if (k > 13.5) return { col: carpet, m: [1.0, 0, IN] };          // suelo
        return { col: dark, m: [0.9, 0, IN] };                          // paneles de puerta
      },
    });
    const quad = (a, b, c, d, col, m) => {
      const n = norm(cross(sub(b, a), sub(d, a)));
      B.tri(a, b, c, n, n, n, col, m); B.tri(a, c, d, n, n, n, col, m);
    };
    // Tablero (la textura de instrumentos se aplica en el shader según la posición).
    const P = PANEL, zt = P.z0 - P.tilt * P.h;
    quad([P.x0, P.y0, P.z0], [P.x0 + P.w, P.y0, P.z0], [P.x0 + P.w, P.y0 + P.h, zt], [P.x0, P.y0 + P.h, zt], [0.05, 0.05, 0.055], [0.8, 0, MAT.PANEL]);
    // Visera antirreflejos y remate hacia el piloto
    const gy = P.y0 + P.h + 0.012;
    quad([-0.55, gy, zt + 0.07], [0.55, gy, zt + 0.07], [0.55, gy + 0.012, -1.0], [-0.55, gy + 0.012, -1.0], [0.05, 0.048, 0.046], [0.85, 0, IN]);
    quad([-0.55, gy - 0.03, zt + 0.07], [0.55, gy - 0.03, zt + 0.07], [0.55, gy, zt + 0.07], [-0.55, gy, zt + 0.07], [0.06, 0.058, 0.055], [0.85, 0, IN]);
    // Parte baja bajo el tablero y cortafuegos
    quad([-0.55, -0.62, P.z0 - 0.02], [0.55, -0.62, P.z0 - 0.02], [0.55, P.y0, P.z0], [-0.55, P.y0, P.z0], dark, [0.95, 0, IN]);
    // Mamparo trasero
    quad([0.5, -0.5, 1.72], [-0.5, -0.5, 1.72], [-0.5, 0.55, 1.72], [0.5, 0.55, 1.72], dark, [0.95, 0, IN]);
    // Asientos delanteros (respaldos) y banco trasero
    const box = (c, h, col) => {
      const [x, y, z] = c, [a, b, d] = h;
      const v = (sx, sy, sz) => [x + sx * a, y + sy * b, z + sz * d];
      quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), col, [0.95, 0, IN]);
      quad(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), col, [0.95, 0, IN]);
      quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), col, [0.95, 0, IN]);
      quad(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), col, [0.95, 0, IN]);
      quad(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1), col, [0.95, 0, IN]);
    };
    const seatCol = [0.19, 0.15, 0.115];
    for (const sx of [-1, 1]) {
      box([sx * 0.25, 0.02, 0.20], [0.2, 0.36, 0.045], seatCol);     // respaldo
      box([sx * 0.25, -0.32, -0.02], [0.2, 0.05, 0.22], seatCol);    // banqueta
      box([sx * 0.25, 0.44, 0.21], [0.11, 0.07, 0.04], seatCol);     // reposacabezas
    }
    box([0, -0.05, 1.12], [0.44, 0.33, 0.05], seatCol);
    box([0, -0.34, 0.92], [0.44, 0.05, 0.2], seatCol);
    // Brújula magnética sobre la visera
    box([0.0, gy + 0.045, zt - 0.02], [0.035, 0.03, 0.03], [0.01, 0.01, 0.01]);
  }
  // Yugos (volantes de mando)
  for (const sx of [-1, 1]) {
    const name = sx < 0 ? 'yokeL' : 'yokeR';
    const hub = [sx * 0.24, 0.00, -0.50];
    B.part(name, hub, [0, 0, 1]);
    const yc = [0.018, 0.018, 0.02], ym = [0.55, 0, MAT.INTERIOR];
    B.tube([hub[0], hub[1], PANEL.z0 + 0.01], hub, 0.012, 0.012, { seg: 8, col: [0.5, 0.5, 0.52], m: [0.3, 1, MAT.METAL], caps: false });
    B.tube([hub[0] - 0.13, hub[1], hub[2]], [hub[0] + 0.13, hub[1], hub[2]], 0.017, 0.017, { seg: 8, col: yc, m: ym });
    for (const g of [-1, 1]) {
      B.tube([hub[0] + g * 0.13, hub[1] - 0.005, hub[2]], [hub[0] + g * 0.155, hub[1] + 0.105, hub[2] + 0.012], 0.017, 0.015, { seg: 8, col: yc, m: ym });
    }
  }

  const mesh = B.finish();
  mesh.hub = HUB;
  mesh.wingY = WING_Y;
  return mesh;
}
