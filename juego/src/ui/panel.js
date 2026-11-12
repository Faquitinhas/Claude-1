// Panel de instrumentos analógicos dibujado en un canvas 2D (luego se usa como textura del
// tablero 3D). Los seis instrumentos básicos, tacómetro, combustible, aceite, GPS y avisos.
import { KT, FT, SPEC } from '../aircraft/fdm.js';

const W = 2048, H = 880;
const RAD = Math.PI / 180;
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// Posición de los instrumentos (px en el canvas).
const R = 88;
const L = {
  asi: [360, 118], ai: [551, 118], alt: [742, 118],
  tc: [360, 312], hi: [551, 312], vsi: [742, 312],
  tach: [935, 112], fuel: [915, 300], oil: [1040, 300],
  gps: [1150, 30, 300, 210], radio: [1150, 258, 300, 150],
  ann: [300, 5], flap: [1500, 300], trim: [1575, 300],
  clock: [1700, 110],
};

function polar(cx, cy, r, aDeg) { const a = aDeg * RAD; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; }

function dialFace(g, cx, cy, r) {
  // bisel
  const gr = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  gr.addColorStop(0, '#5a5c60'); gr.addColorStop(0.5, '#1c1d1f'); gr.addColorStop(1, '#3c3e42');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r + 9, 0, 7); g.fill();
  g.fillStyle = '#0b0c0d'; g.beginPath(); g.arc(cx, cy, r + 2, 0, 7); g.fill();
  const g2 = g.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  g2.addColorStop(0, '#1d1e21'); g2.addColorStop(1, '#0d0e0f');
  g.fillStyle = g2; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  // tornillos
  g.fillStyle = '#2b2c2f';
  for (const a of [45, 135, 225, 315]) { const [x, y] = polar(cx, cy, r + 22, a); g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
}
function tick(g, cx, cy, r0, r1, aDeg, w, col = '#f2f2ee') {
  const [x0, y0] = polar(cx, cy, r0, aDeg), [x1, y1] = polar(cx, cy, r1, aDeg);
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}
function label(g, txt, x, y, size, col = '#f2f2ee', weight = 'bold', align = 'center') {
  g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(txt, x, y);
}
function arc(g, cx, cy, r, a0, a1, w, col) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
  g.beginPath(); g.arc(cx, cy, r, (a0 - 90) * RAD, (a1 - 90) * RAD); g.stroke();
}
function needle(g, cx, cy, aDeg, len, w, col = '#f4f4f0', tail = 14) {
  g.save(); g.translate(cx, cy); g.rotate(aDeg * RAD);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.moveTo(-w / 2 + 2, tail + 3); g.lineTo(2, -len + 3); g.lineTo(w / 2 + 2, tail + 3); g.fill();
  g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, tail); g.lineTo(-w / 4, -len * 0.82); g.lineTo(0, -len); g.lineTo(w / 4, -len * 0.82); g.lineTo(w / 2, tail); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#18191b'; g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fill();
  g.fillStyle = '#3a3b3e'; g.beginPath(); g.arc(cx, cy, 3, 0, 7); g.fill();
}
function interp(table, v) {
  if (v <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (v <= table[i][0]) { const [a, b] = [table[i - 1], table[i]]; return a[1] + ((b[1] - a[1]) * (v - a[0])) / (b[0] - a[0]); }
  }
  return table[table.length - 1][1];
}
const ASI_MAP = [[0, 0], [40, 32], [60, 78], [80, 128], [100, 172], [120, 212], [140, 250], [160, 286], [180, 318], [200, 346]];
const VSI_MAP = [[0, 0], [500, 38], [1000, 82], [1500, 126], [2000, 168]];

export class InstrumentPanel {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.bg.width = W; this.bg.height = H;
    this._static(this.bg.getContext('2d'));
    this.sm = { vs: 0, tr: 0, ball: 0, oilT: 20, oilP: 0 };
    this.nav = { ident: '----', name: '', brg: 0, dist: 0 };
    this.t = 0;
  }

  _static(g) {
    // fondo del tablero
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#2b2d31'); gr.addColorStop(1, '#1e2023');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // textura sutil
    g.globalAlpha = 0.05;
    for (let i = 0; i < 2600; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.fillRect((i * 733) % W, (i * 397) % H, 2, 2); }
    g.globalAlpha = 1;
    // subpanel de instrumentos de vuelo
    g.fillStyle = '#17181a'; g.strokeStyle = '#3d4044'; g.lineWidth = 3;
    this._rr(g, 238, 8, 632, 420, 16); g.fill(); g.stroke();
    this._rr(g, 836 + 0, 8, 290, 420, 16); g.fill(); g.stroke();

    // ---- anemómetro ----
    let [cx, cy] = L.asi; dialFace(g, cx, cy, R);
    const A = (k) => interp(ASI_MAP, k);
    arc(g, cx, cy, R - 8, A(SPEC.vs0), A(SPEC.vfe), 7, '#e9e9e4');             // arco blanco (flaps)
    arc(g, cx, cy, R - 16, A(SPEC.vs1), A(SPEC.vno), 8, '#1faa3c');           // verde
    arc(g, cx, cy, R - 16, A(SPEC.vno), A(SPEC.vne), 8, '#e8c21a');           // amarillo
    tick(g, cx, cy, R - 24, R - 2, A(SPEC.vne), 5, '#e02a1e');                 // línea roja
    for (let k = 40; k <= 200; k += 10) tick(g, cx, cy, R - (k % 20 === 0 ? 20 : 12), R - 3, A(k), k % 20 === 0 ? 3 : 2);
    for (let k = 40; k <= 200; k += 20) { const [x, y] = polar(cx, cy, R - 35, A(k)); label(g, String(k), x, y, 17); }
    label(g, 'AIRSPEED', cx, cy - 26, 11, '#c9c9c4'); label(g, 'KNOTS', cx, cy + 30, 11, '#c9c9c4');

    // ---- altímetro ----
    [cx, cy] = L.alt; dialFace(g, cx, cy, R);
    for (let i = 0; i < 50; i++) tick(g, cx, cy, R - (i % 5 === 0 ? 18 : 10), R - 3, i * 7.2, i % 5 === 0 ? 3 : 1.6);
    for (let i = 0; i < 10; i++) { const [x, y] = polar(cx, cy, R - 34, i * 36); label(g, String(i), x, y, 22); }
    label(g, 'ALT', cx, cy - 30, 12, '#c9c9c4'); label(g, '100 FEET', cx, cy + 46, 9, '#c9c9c4', 'normal');
    g.fillStyle = '#050505'; g.fillRect(cx + 22, cy - 9, 46, 18); g.strokeStyle = '#555'; g.lineWidth = 1; g.strokeRect(cx + 22, cy - 9, 46, 18);
    label(g, '29.92', cx + 45, cy + 1, 12, '#e6e6e0', 'normal');

    // ---- variómetro ----
    [cx, cy] = L.vsi; dialFace(g, cx, cy, R);
    for (const s of [1, -1]) {
      for (let v = 0; v <= 2000; v += 100) {
        const a = -90 + s * interp(VSI_MAP, v);
        tick(g, cx, cy, R - (v % 500 === 0 ? 20 : 11), R - 3, a, v % 500 === 0 ? 3 : 1.6);
      }
      for (const v of [500, 1000, 1500]) { const [x, y] = polar(cx, cy, R - 35, -90 + s * interp(VSI_MAP, v)); label(g, String(v / 100), x, y, 18); }
    }
    { const [x, y] = polar(cx, cy, R - 35, -90); label(g, '0', x, y, 18); const [x2, y2] = polar(cx, cy, R - 35, 90); label(g, '20', x2 - 2, y2, 18); }
    label(g, 'VERTICAL SPEED', cx + 6, cy - 22, 9, '#c9c9c4'); label(g, '100 FT PER MIN', cx + 6, cy + 24, 9, '#c9c9c4', 'normal');
    label(g, 'UP', cx - 38, cy - 22, 10, '#c9c9c4'); label(g, 'DN', cx - 38, cy + 24, 10, '#c9c9c4');

    // ---- coordinador de viraje ----
    [cx, cy] = L.tc; dialFace(g, cx, cy, R);
    for (const a of [-90, 90]) tick(g, cx, cy, R - 16, R - 3, a, 4);
    for (const a of [-70, 70]) tick(g, cx, cy, R - 16, R - 3, a + 180 * 0 + (a > 0 ? 20 + 20 : -20 - 20) * 0 + 0, 0);
    // marcas de viraje estándar (2 min)
    for (const s of [-1, 1]) { tick(g, cx, cy, R - 16, R - 3, s * 90 + s * 20, 4); }
    label(g, 'L', cx - 52, cy + 30, 16); label(g, 'R', cx + 52, cy + 30, 16);
    label(g, '2 MIN', cx, cy + 74, 10, '#c9c9c4'); label(g, 'TURN COORDINATOR', cx, cy - 62, 9, '#c9c9c4');
    label(g, 'NO PITCH', cx, cy - 46, 7, '#a9a9a4', 'normal'); label(g, 'INFORMATION', cx, cy - 37, 7, '#a9a9a4', 'normal');
    // tubo del inclinómetro
    g.fillStyle = '#d8d6c4'; this._rr(g, cx - 46, cy + 42, 92, 20, 10); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 11, cy + 42); g.lineTo(cx - 11, cy + 62); g.moveTo(cx + 11, cy + 42); g.lineTo(cx + 11, cy + 62); g.stroke();

    // ---- horizonte artificial y giro direccional: solo el bisel (el interior es dinámico) ----
    for (const k of ['ai', 'hi']) { [cx, cy] = L[k]; dialFace(g, cx, cy, R); }

    // ---- tacómetro ----
    [cx, cy] = L.tach; dialFace(g, cx, cy, 78);
    const TA = (rpm) => -135 + (rpm / 3500) * 270;
    arc(g, cx, cy, 78 - 9, TA(2100), TA(2700), 7, '#1faa3c');
    tick(g, cx, cy, 78 - 22, 78 - 2, TA(2700), 5, '#e02a1e');
    for (let r = 0; r <= 3500; r += 100) tick(g, cx, cy, 78 - (r % 500 === 0 ? 17 : 9), 78 - 3, TA(r), r % 500 === 0 ? 3 : 1.4);
    for (let r = 0; r <= 3500; r += 500) { const [x, y] = polar(cx, cy, 78 - 30, TA(r)); label(g, String(r / 100), x, y, 15); }
    label(g, 'RPM', cx, cy - 22, 11, '#c9c9c4'); label(g, 'X 100', cx, cy + 24, 9, '#c9c9c4', 'normal');

    // ---- combustible y aceite (indicadores dobles) ----
    for (const [k, t1, t2] of [['fuel', 'FUEL L', 'FUEL R'], ['oil', 'OIL TEMP', 'OIL PRESS']]) {
      const [x, y] = L[k];
      g.fillStyle = '#0b0c0d'; this._rr(g, x - 54, y - 62, 108, 124, 8); g.fill();
      g.strokeStyle = '#4a4c50'; g.lineWidth = 3; g.stroke();
      for (const s of [-1, 1]) {
        const px = x + s * 4, a0 = s < 0 ? 215 : 35, a1 = s < 0 ? 325 : 145;
        // escala
        for (let i = 0; i <= 4; i++) { const a = s < 0 ? a1 - (i / 4) * 110 : a0 + (i / 4) * 110; tick(g, px, y, 34, 44, s < 0 ? 270 + (i / 4 - 0.5) * 110 : 90 - (i / 4 - 0.5) * 110, i % 2 === 0 ? 2.5 : 1.4); void a; }
        if (k === 'fuel') { label(g, 'E', px + s * 30, y + 34, 11); label(g, 'F', px + s * 30, y - 34, 11); tick(g, px, y, 30, 46, s < 0 ? 270 - 55 : 90 + 55, 4, '#e02a1e'); }
        else { arc(g, px, y, 40, s < 0 ? 250 : 70, s < 0 ? 310 : 125, 5, '#1faa3c'); tick(g, px, y, 30, 46, s < 0 ? 270 + 55 : 90 - 55, 4, '#e02a1e'); }
      }
      label(g, t1, x - 26, y + 54, 8, '#c9c9c4'); label(g, t2, x + 28, y + 54, 8, '#c9c9c4');
    }

    // ---- GPS y radios ----
    const [gx, gy, gw, gh] = L.gps;
    g.fillStyle = '#0c0d0e'; this._rr(g, gx - 8, gy - 8, gw + 16, gh + 16, 8); g.fill();
    g.strokeStyle = '#4a4c50'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#04080a'; g.fillRect(gx, gy, gw, gh);
    const [rx, ry, rw, rh] = L.radio;
    for (let i = 0; i < 3; i++) {
      g.fillStyle = '#0c0d0e'; this._rr(g, rx - 8, ry + i * 50, rw + 16, 44, 6); g.fill(); g.strokeStyle = '#4a4c50'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#050607'; g.fillRect(rx + 6, ry + i * 50 + 7, 170, 30);
      label(g, ['118.300  121.700', '110.50   113.90', '1200  ALT'][i], rx + 91, ry + i * 50 + 23, 15, '#f08c1e', 'normal');
      label(g, ['COM 1', 'NAV 1', 'XPDR'][i], rx + 232, ry + i * 50 + 23, 12, '#b9b9b4');
      g.fillStyle = '#2c2d30'; g.beginPath(); g.arc(rx + 285, ry + i * 50 + 22, 11, 0, 7); g.fill();
    }

    // ---- flaps y compensador ----
    let [fx, fy] = L.flap;
    g.fillStyle = '#0b0c0d'; this._rr(g, fx - 26, fy - 70, 52, 140, 6); g.fill(); g.strokeStyle = '#4a4c50'; g.lineWidth = 2; g.stroke();
    ['0', '10', '20', '30'].forEach((t, i) => { label(g, t, fx + 10, fy - 52 + i * 35, 11, '#d9d9d4'); g.fillStyle = '#d9d9d4'; g.fillRect(fx - 20, fy - 53 + i * 35, 8, 2); });
    label(g, 'FLAPS', fx, fy + 84, 11, '#c9c9c4');
    [fx, fy] = L.trim;
    g.fillStyle = '#0b0c0d'; this._rr(g, fx - 22, fy - 70, 44, 140, 6); g.fill(); g.strokeStyle = '#4a4c50'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#1faa3c'; g.fillRect(fx + 6, fy - 8, 6, 16);
    label(g, 'DN', fx, fy - 82, 9, '#c9c9c4'); label(g, 'UP', fx, fy + 96, 9, '#c9c9c4'); label(g, 'TRIM', fx, fy + 84, 11, '#c9c9c4');

    // ---- reloj ----
    [cx, cy] = L.clock; dialFace(g, cx, cy, 62);
    for (let i = 0; i < 60; i++) tick(g, cx, cy, 62 - (i % 5 === 0 ? 14 : 7), 62 - 3, i * 6, i % 5 === 0 ? 2.6 : 1.2);
    for (let i = 1; i <= 12; i++) { const [x, y] = polar(cx, cy, 62 - 25, i * 30); label(g, String(i), x, y, 12); }

    // ---- placa ----
    label(g, 'LV-HZN', 1880, 60, 30, '#d8d8d2');
    label(g, SPEC.name.toUpperCase(), 1880, 92, 13, '#a8a8a2', 'normal');
    // interruptores (decorativos)
    for (let i = 0; i < 9; i++) {
      const x = 300 + i * 62, y = 505;
      g.fillStyle = '#0d0e0f'; this._rr(g, x - 16, y - 26, 32, 52, 5); g.fill();
      g.fillStyle = i < 2 ? '#b3261e' : '#d9d9d2'; this._rr(g, x - 9, y - 20, 18, 22, 3); g.fill();
      label(g, ['MASTER', 'ALT', 'PUMP', 'BCN', 'LAND', 'TAXI', 'NAV', 'STROBE', 'PITOT'][i], x, y + 40, 9, '#b9b9b4');
    }
  }

  _rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  // Dibuja el estado actual. nav: {ident, name, brg (°), dist (m)}
  draw(ac, dt, env, nav) {
    const g = this.g, tel = ac.tel, s = this.sm;
    this.t += dt;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    const kias = tel.ias / KT, altFt = tel.alt / FT;
    const k = 1 - Math.exp(-dt / 0.6);
    s.vs += (tel.vs / FT * 60 - s.vs) * (1 - Math.exp(-dt / 1.2));      // el variómetro real tiene retardo
    s.tr += (tel.turnRate + (-ac.omega[2]) * 0.35 - s.tr) * (1 - Math.exp(-dt / 0.25));
    s.ball += (tel.slipBall - s.ball) * (1 - Math.exp(-dt / 0.18));
    const rpm = ac.engine.rpm;
    s.oilT += ((ac.engine.running ? 85 + rpm / 2700 * 20 : 20) - s.oilT) * (1 - Math.exp(-dt / 90));
    s.oilP += ((ac.engine.running ? 0.35 + 0.5 * Math.min(rpm / 1800, 1) : 0) - s.oilP) * k;

    // ---- anemómetro ----
    let [cx, cy] = L.asi;
    needle(g, cx, cy, interp(ASI_MAP, Math.max(kias, 0)), R - 10, 9);

    // ---- horizonte artificial ----
    [cx, cy] = L.ai;
    const pitchDeg = tel.pitch / RAD, roll = tel.roll;
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    g.translate(cx, cy); g.rotate(-roll);
    const ppd = R / 28;   // píxeles por grado
    g.translate(0, pitchDeg * ppd);
    const sky = g.createLinearGradient(0, -R * 2.2, 0, 0);
    sky.addColorStop(0, '#1b5fb8'); sky.addColorStop(1, '#5aa4ea');
    g.fillStyle = sky; g.fillRect(-R * 3, -R * 5, R * 6, R * 5);
    const gnd = g.createLinearGradient(0, 0, 0, R * 2.2);
    gnd.addColorStop(0, '#8a5a2b'); gnd.addColorStop(1, '#4e3013');
    g.fillStyle = gnd; g.fillRect(-R * 3, 0, R * 6, R * 5);
    g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-R * 3, 0); g.lineTo(R * 3, 0); g.stroke();
    g.lineWidth = 2;
    for (let p = -60; p <= 60; p += 5) {
      if (p === 0) continue;
      const y = -p * ppd, w = p % 10 === 0 ? 26 : 12;
      g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke();
      if (p % 10 === 0) { label(g, String(Math.abs(p)), -w - 12, y, 11, '#fff'); label(g, String(Math.abs(p)), w + 12, y, 11, '#fff'); }
    }
    g.restore();
    // escala de alabeo (gira con el horizonte) e índice fijo
    g.save(); g.translate(cx, cy); g.rotate(-roll);
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const big = a % 30 === 0;
      tick(g, 0, 0, R - (big ? 15 : 9), R - 1, a, big ? 3 : 2, '#fff');
    }
    g.restore();
    g.fillStyle = '#ffb000'; g.beginPath(); g.moveTo(cx, cy - R + 16); g.lineTo(cx - 7, cy - R + 29); g.lineTo(cx + 7, cy - R + 29); g.closePath(); g.fill();
    // avioncito fijo
    g.strokeStyle = '#ffb000'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 48, cy); g.lineTo(cx - 18, cy); g.lineTo(cx - 9, cy + 9); g.moveTo(cx + 48, cy); g.lineTo(cx + 18, cy); g.lineTo(cx + 9, cy + 9); g.stroke();
    g.fillStyle = '#ffb000'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();

    // ---- altímetro ----
    [cx, cy] = L.alt;
    const a10k = (altFt / 100000) * 360, a1k = ((altFt % 10000) / 10000) * 360, a100 = ((altFt % 1000) / 1000) * 360;
    g.save(); g.translate(cx, cy); g.rotate(a10k * RAD);
    g.strokeStyle = '#f2f2ee'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R + 12); g.stroke();
    g.fillStyle = '#f2f2ee'; g.beginPath(); g.moveTo(0, -R + 4); g.lineTo(-6, -R + 16); g.lineTo(6, -R + 16); g.closePath(); g.fill();
    g.restore();
    needle(g, cx, cy, a1k, R * 0.52, 15, '#f4f4f0', 10);
    needle(g, cx, cy, a100, R - 12, 8);

    // ---- coordinador de viraje ----
    [cx, cy] = L.tc;
    const tcAng = Math.max(-38, Math.min(38, (s.tr / (3 * RAD)) * 20));
    g.save(); g.translate(cx, cy - 4); g.rotate(tcAng * RAD);
    g.fillStyle = '#f2f2ee';
    g.fillRect(-60, -3, 120, 6);
    g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
    g.fillRect(-2.5, -24, 5, 22); g.fillRect(-16, -22, 32, 4);
    g.restore();
    g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(cx + Math.max(-1, Math.min(1, s.ball * 2.6)) * 34, cy + 52, 9, 0, 7); g.fill();

    // ---- giro direccional ----
    [cx, cy] = L.hi;
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    g.translate(cx, cy); g.rotate(-tel.heading * RAD);
    for (let a = 0; a < 360; a += 5) tick(g, 0, 0, R - (a % 10 === 0 ? 16 : 9), R - 2, a, a % 10 === 0 ? 2.6 : 1.5);
    const names = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
    for (let i = 0; i < 12; i++) {
      g.save(); g.rotate(i * 30 * RAD); label(g, names[i], 0, -R + 31, i % 3 === 0 ? 21 : 17); g.restore();
    }
    g.restore();
    g.strokeStyle = '#ffb000'; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx, cy - 34); g.lineTo(cx, cy + 30); g.moveTo(cx - 28, cy - 4); g.lineTo(cx + 28, cy - 4); g.moveTo(cx - 11, cy + 22); g.lineTo(cx + 11, cy + 22); g.stroke();
    g.fillStyle = '#ffb000'; g.beginPath(); g.moveTo(cx, cy - R + 2); g.lineTo(cx - 6, cy - R + 14); g.lineTo(cx + 6, cy - R + 14); g.closePath(); g.fill();

    // ---- variómetro ----
    [cx, cy] = L.vsi;
    const v = Math.max(-2000, Math.min(2000, s.vs));
    needle(g, cx, cy, -90 + Math.sign(v) * interp(VSI_MAP, Math.abs(v)), R - 12, 8);

    // ---- tacómetro ----
    [cx, cy] = L.tach;
    needle(g, cx, cy, -135 + (Math.min(rpm, 3500) / 3500) * 270, 78 - 10, 8);

    // ---- combustible / aceite ----
    const fuelFrac = Math.min(ac.fuel / SPEC.fuelCapacity, 1);
    this._half(g, L.fuel, -1, fuelFrac); this._half(g, L.fuel, 1, fuelFrac);
    this._half(g, L.oil, -1, Math.min(Math.max((s.oilT - 20) / 110, 0), 1)); this._half(g, L.oil, 1, s.oilP);

    // ---- flaps y compensador ----
    let [fx, fy] = L.flap;
    g.fillStyle = '#f2f2ee'; g.fillRect(fx - 24, fy - 55 + ac.ctl.flaps * 105, 14, 6);
    [fx, fy] = L.trim;
    g.fillStyle = '#f2f2ee'; g.fillRect(fx - 16, fy - 3 + ac.input.trim * 52, 18, 6);

    // ---- reloj ----
    [cx, cy] = L.clock;
    const hrs = env ? env.timeOfDay : 12;
    needle(g, cx, cy, ((hrs % 12) / 12) * 360, 30, 8, '#f4f4f0', 6);
    needle(g, cx, cy, ((hrs * 60) % 60) * 6, 46, 6, '#f4f4f0', 8);

    // ---- avisos ----
    const [ax, ay] = L.ann;
    const ann = [
      ['PÉRDIDA', tel.stallWarn, '#ff3b2f'], ['FRENO', ac.input.parkBrake, '#ffb000'],
      ['COMB. BAJO', ac.fuel < 12, '#ffb000'], ['MOTOR', !ac.engine.running, '#ff3b2f'],
      ['VEL. EXCES.', kias > SPEC.vne, '#ff3b2f'],
    ];
    ann.forEach(([txt, on, col], i) => {
      const x = 905 + (i % 2) * 110, y = 215 + Math.floor(i / 2) * 26 - 12 + 185;
      void ax; void ay;
      g.fillStyle = on ? col : '#151617'; this._rr(g, x - 50, y - 10, 100, 20, 4); g.fill();
      label(g, txt, x, y + 1, 11, on ? '#140600' : '#3a3b3d');
    });

    // ---- GPS ----
    const [gx, gy, gw, gh] = L.gps;
    const n = nav || this.nav;
    const gs = tel.groundSpeed / KT;
    const trk = tel.groundSpeed > 2 ? ((Math.atan2(ac.vel[0], -ac.vel[2]) / RAD) + 360) % 360 : tel.heading;
    label(g, 'GPS', gx + 10, gy + 16, 13, '#35d0ff', 'bold', 'left');
    label(g, `${n.ident}  ${n.name || ''}`, gx + gw - 10, gy + 16, 13, '#7dff8a', 'bold', 'right');
    g.fillStyle = '#143038'; g.fillRect(gx, gy + 28, gw, 1.5);
    const nm = n.dist / 1852;
    label(g, 'RUMBO', gx + 12, gy + 48, 11, '#8fb7c2', 'normal', 'left'); label(g, `${String(Math.round(n.brg) % 360).padStart(3, '0')}°`, gx + 12, gy + 70, 24, '#ffffff', 'bold', 'left');
    label(g, 'DIST', gx + 112, gy + 48, 11, '#8fb7c2', 'normal', 'left'); label(g, `${nm < 10 ? nm.toFixed(1) : nm.toFixed(0)} NM`, gx + 112, gy + 70, 24, '#ffffff', 'bold', 'left');
    label(g, 'GS', gx + 12, gy + 104, 11, '#8fb7c2', 'normal', 'left'); label(g, `${gs.toFixed(0)} kt`, gx + 12, gy + 124, 20, '#ffffff', 'bold', 'left');
    label(g, 'DERROTA', gx + 112, gy + 104, 11, '#8fb7c2', 'normal', 'left'); label(g, `${String(Math.round(trk) % 360).padStart(3, '0')}°`, gx + 112, gy + 124, 20, '#ffffff', 'bold', 'left');
    const ete = gs > 20 ? (nm / gs) * 60 : null;
    label(g, 'ETE', gx + 12, gy + 158, 11, '#8fb7c2', 'normal', 'left');
    label(g, ete === null ? '--:--' : `${String(Math.floor(ete)).padStart(2, '0')}:${String(Math.floor((ete % 1) * 60)).padStart(2, '0')}`, gx + 12, gy + 178, 20, '#ffffff', 'bold', 'left');
    // flecha hacia el destino relativa al rumbo
    const rcx = gx + gw - 62, rcy = gy + 126;
    g.strokeStyle = '#1e5562'; g.lineWidth = 2; g.beginPath(); g.arc(rcx, rcy, 50, 0, 7); g.stroke();
    for (let a = 0; a < 360; a += 30) tick(g, rcx, rcy, 44, 50, a - tel.heading, 2, '#3c8ea0');
    { const [x, y] = polar(rcx, rcy, 36, -tel.heading); label(g, 'N', x, y, 12, '#35d0ff'); }
    g.save(); g.translate(rcx, rcy); g.rotate((n.brg - tel.heading) * RAD);
    g.fillStyle = '#ff4fd8'; g.beginPath(); g.moveTo(0, -42); g.lineTo(-9, -22); g.lineTo(-3, -22); g.lineTo(-3, 30); g.lineTo(3, 30); g.lineTo(3, -22); g.lineTo(9, -22); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(rcx, rcy - 9); g.lineTo(rcx - 7, rcy + 7); g.lineTo(rcx, rcy + 3); g.lineTo(rcx + 7, rcy + 7); g.closePath(); g.fill();
  }

  _half(g, pos, side, frac) {
    const [x, y] = pos;
    const px = x + side * 4;
    const a = side < 0 ? 270 + (frac - 0.5) * 110 : 90 - (frac - 0.5) * 110;
    g.save(); g.translate(px, y); g.rotate(a * RAD);
    g.fillStyle = '#f2f2ee'; g.beginPath(); g.moveTo(-2.5, 0); g.lineTo(0, -42); g.lineTo(2.5, 0); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#222'; g.beginPath(); g.arc(px, y, 5, 0, 7); g.fill();
  }
}
