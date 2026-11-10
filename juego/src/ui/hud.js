// HUD 2D sobre el canvas del juego: datos de vuelo, brújula, avisos, mensajes y mapa.
import { KT, FT, SPEC } from '../aircraft/fdm.js';
import { AIRPORTS } from '../world/airports.js';
import { WORLD_SIZE, WORLD_MIN } from '../world/terrainGen.js';

const RAD = Math.PI / 180;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// Navegadores sin roundRect (Safari antiguo): rectángulo simple.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.mode = 2;            // 0 = oculto, 1 = mínimo, 2 = completo
    this.showMap = false;
    this.mapImage = null;     // canvas con el mapa de la isla
    this.messages = [];       // {text, t, color}
    this.objective = '';
    this.subtitle = '';
    this.sm = { vs: 0 };
    this.trail = [];
    this._trailT = 0;
    this.t = 0;
    this.touchUI = false;
    this.waypoint = null;     // {x, z, name}
  }

  resize() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.s = Math.max(0.62, Math.min(1.7, Math.min(w / 1280, h / 720))) * (this.touchUI ? 1.0 : 1.0);
  }

  message(text, seconds = 4, color = '#ffffff') {
    this.messages = this.messages.filter((m) => m.text !== text);
    this.messages.push({ text, t: seconds, color });
    if (this.messages.length > 4) this.messages.shift();
  }

  _panel(x, y, w, h, r = 10) {
    const g = this.g;
    g.fillStyle = 'rgba(8,14,22,0.52)';
    g.beginPath(); g.roundRect(x, y, w, h, r * this.s); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.stroke();
  }
  _text(t, x, y, size, color = '#fff', align = 'left', weight = 600) {
    const g = this.g;
    g.font = `${weight} ${Math.round(size * this.s)}px ${FONT}`;
    g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillStyle = color;
    g.fillText(t, x, y);
  }

  draw(game, dt) {
    const g = this.g, c = this.canvas, s = this.s, W = c.width, H = c.height;
    this.t += dt;
    g.clearRect(0, 0, W, H);
    const ac = game.ac, tel = ac.tel, env = game.env;
    // traza para el mapa
    this._trailT -= dt;
    if (this._trailT <= 0 && game.state === 'flying') { this._trailT = 2; this.trail.push([ac.pos[0], ac.pos[2]]); if (this.trail.length > 600) this.trail.shift(); }

    // ---- mensajes ----
    let my = H * 0.20;
    for (const m of this.messages) {
      m.t -= dt;
      const a = Math.min(1, m.t * 2);
      if (a <= 0) continue;
      g.globalAlpha = a;
      g.font = `600 ${Math.round(22 * s)}px ${FONT}`;
      const tw = g.measureText(m.text).width;
      this._panel(W / 2 - tw / 2 - 18 * s, my - 26 * s, tw + 36 * s, 38 * s, 8);
      this._text(m.text, W / 2, my, 22, m.color, 'center');
      g.globalAlpha = 1;
      my += 46 * s;
    }
    this.messages = this.messages.filter((m) => m.t > 0);
    if (this.mode === 0 || game.state !== 'flying') { if (this.showMap) this._map(game); return; }

    const kias = tel.ias / KT, altFt = tel.alt / FT, aglFt = Math.max(tel.agl, 0) / FT;
    this.sm.vs += (tel.vs / FT * 60 - this.sm.vs) * (1 - Math.exp(-dt / 0.5));
    const vs = this.sm.vs;
    const pad = 18 * s, bh = 96 * s;
    const lift = this.touchUI ? 0 : 0;
    const by = H - bh - pad - lift;

    // ---- avisos ----
    const warn = [];
    if (ac.crashed) warn.push(['ACCIDENTE', '#ff4a3d']);
    else {
      if (tel.stallWarn) warn.push(['PÉRDIDA', '#ff4a3d']);
      if (kias > SPEC.vne) warn.push(['EXCESO DE VELOCIDAD', '#ff4a3d']);
      else if (ac.ctl.flaps > 0.05 && kias > SPEC.vfe + 3) warn.push(['FLAPS: VELOCIDAD EXCESIVA', '#ffb020']);
      if (game.gpws) warn.push([game.gpws, '#ff4a3d']);
      if (!ac.engine.running && !tel.onGround) warn.push(['MOTOR PARADO', '#ffb020']);
      if (ac.fuel < 10) warn.push(['COMBUSTIBLE BAJO', '#ffb020']);
      if (tel.g > SPEC.gLimitPos || tel.g < SPEC.gLimitNeg) warn.push(['LÍMITE DE CARGA', '#ffb020']);
    }
    let wy = H * 0.11;
    const blink = Math.sin(this.t * 9) > -0.3;
    for (const [txt, col] of warn) {
      if (col === '#ff4a3d' && !blink) { wy += 44 * s; continue; }
      g.font = `800 ${Math.round(26 * s)}px ${FONT}`;
      const tw = g.measureText(txt).width;
      g.fillStyle = col === '#ff4a3d' ? 'rgba(120,10,6,0.78)' : 'rgba(80,50,0,0.72)';
      g.beginPath(); g.roundRect(W / 2 - tw / 2 - 16 * s, wy - 28 * s, tw + 32 * s, 40 * s, 6 * s); g.fill();
      this._text(txt, W / 2, wy, 26, '#fff', 'center', 800);
      wy += 44 * s;
    }

    // ---- objetivo de misión ----
    if (this.objective) {
      g.font = `600 ${Math.round(17 * s)}px ${FONT}`;
      const tw = Math.max(g.measureText(this.objective).width, this.subtitle ? g.measureText(this.subtitle).width : 0);
      this._panel(pad, pad, tw + 28 * s, (this.subtitle ? 62 : 40) * s, 8);
      this._text(this.objective, pad + 14 * s, pad + 26 * s, 17, '#ffe9a8');
      if (this.subtitle) this._text(this.subtitle, pad + 14 * s, pad + 49 * s, 14, '#cfd8e3', 'left', 500);
    }

    // ---- hora y viento ----
    {
      const h = Math.floor(env.timeOfDay), m = Math.floor((env.timeOfDay % 1) * 60);
      const w = 190 * s;
      this._panel(W - pad - w, pad, w, 40 * s, 8);
      this._text(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, W - pad - w + 14 * s, pad + 27 * s, 17, '#fff');
      const wd = env.wind.dir, wk = env.wind.speed / KT;
      this._text(`${String(Math.round(wd / 10) * 10 % 360 || 360).padStart(3, '0')}°/${wk.toFixed(0)} kt`, W - pad - 14 * s, pad + 27 * s, 15, '#bfe3ff', 'right', 500);
      // flecha de viento relativa al rumbo
      const ax = W - pad - w + 86 * s, ay = pad + 20 * s;
      g.save(); g.translate(ax, ay); g.rotate((wd + 180 - tel.heading) * RAD);
      g.strokeStyle = '#bfe3ff'; g.fillStyle = '#bfe3ff'; g.lineWidth = 2 * s;
      g.beginPath(); g.moveTo(0, 9 * s); g.lineTo(0, -9 * s); g.stroke();
      g.beginPath(); g.moveTo(0, -12 * s); g.lineTo(-5 * s, -4 * s); g.lineTo(5 * s, -4 * s); g.closePath(); g.fill();
      g.restore();
    }

    if (this.mode >= 1) {
      // ---- velocidad (izquierda) ----
      const lw = 250 * s;
      this._panel(pad, by, lw, bh);
      this._text('VELOCIDAD', pad + 14 * s, by + 22 * s, 11, '#9fb3c8', 'left', 600);
      const spCol = tel.stallWarn ? '#ff6a5e' : kias > SPEC.vno ? '#ffcc4d' : '#ffffff';
      this._text(kias.toFixed(0), pad + 14 * s, by + 70 * s, 46, spCol, 'left', 700);
      g.font = `700 ${Math.round(46 * s)}px ${FONT}`;
      const nw = g.measureText(kias.toFixed(0)).width;
      this._text('kt', pad + 20 * s + nw, by + 70 * s, 16, '#9fb3c8', 'left', 500);
      // gases
      const tx = pad + 150 * s, tw2 = 14 * s, th = 62 * s, ty0 = by + 22 * s;
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(tx, ty0, tw2, th);
      g.fillStyle = '#58d68d'; g.fillRect(tx, ty0 + th * (1 - ac.ctl.throttle), tw2, th * ac.ctl.throttle);
      g.fillStyle = '#fff'; g.fillRect(tx - 3 * s, ty0 + th * (1 - ac.input.throttle) - 1.5 * s, tw2 + 6 * s, 3 * s);
      this._text('GASES', tx + tw2 / 2, by + 16 * s, 10, '#9fb3c8', 'center', 600);
      this._text(`${Math.round(ac.engine.rpm / 10) * 10}`, tx + 24 * s, by + 46 * s, 17, ac.engine.running ? '#fff' : '#ff6a5e', 'left', 600);
      this._text('RPM', tx + 24 * s, by + 62 * s, 10, '#9fb3c8', 'left', 600);
      // flaps
      this._text(`FLAPS ${Math.round(ac.ctl.flaps * 30)}°`, tx + 24 * s, by + 84 * s, 12, ac.ctl.flaps > 0.02 ? '#ffe08a' : '#9fb3c8', 'left', 600);
      if (ac.input.parkBrake || ac.input.brake > 0.1) this._text(ac.input.parkBrake ? 'FRENO EST.' : 'FRENOS', pad + 14 * s, by + 90 * s, 11, '#ffb020', 'left', 700);

      // ---- altitud (derecha) ----
      const rw = 250 * s, rx = W - pad - rw;
      this._panel(rx, by, rw, bh);
      this._text('ALTITUD', rx + rw - 14 * s, by + 22 * s, 11, '#9fb3c8', 'right', 600);
      this._text('ft', rx + rw - 14 * s, by + 70 * s, 16, '#9fb3c8', 'right', 500);
      g.font = `500 ${Math.round(16 * s)}px ${FONT}`;
      const fw = g.measureText('ft').width;
      this._text(Math.round(altFt / 10) * 10 + '', rx + rw - 20 * s - fw, by + 70 * s, 46, '#fff', 'right', 700);
      const vsr = Math.round(vs / 50) * 50;
      this._text(`${vsr > 0 ? '▲' : vsr < 0 ? '▼' : '■'} ${Math.abs(vsr)} ft/min`, rx + 14 * s, by + 46 * s, 14, vsr < -900 ? '#ffb020' : '#d7e3ee', 'left', 600);
      if (aglFt < 2500) this._text(`sobre el terreno ${Math.round(aglFt / 5) * 5} ft`, rx + 14 * s, by + 86 * s, 12, aglFt < 200 && !tel.onGround ? '#ffe08a' : '#9fb3c8', 'left', 500);
      this._text(`G ${tel.g.toFixed(1)}`, rx + 14 * s, by + 66 * s, 12, Math.abs(tel.g) > 3 ? '#ffb020' : '#9fb3c8', 'left', 500);

      // ---- brújula (centro) ----
      const cw = Math.min(520 * s, W - 2 * lw - 4 * pad), cx = W / 2, ch = 58 * s, cy = H - pad - ch - lift;
      if (cw > 160 * s) {
        this._panel(cx - cw / 2, cy, cw, ch);
        g.save(); g.beginPath(); g.rect(cx - cw / 2 + 4, cy, cw - 8, ch); g.clip();
        const ppd = cw / 110;   // píxeles por grado
        const hd = tel.heading;
        for (let a = Math.floor((hd - 60) / 5) * 5; a <= hd + 60; a += 5) {
          const x = cx + (a - hd) * ppd;
          const aa = ((a % 360) + 360) % 360;
          g.fillStyle = 'rgba(255,255,255,0.75)';
          g.fillRect(x - 1, cy + ch - (aa % 10 === 0 ? 14 : 8) * s, 2, (aa % 10 === 0 ? 14 : 8) * s);
          if (aa % 30 === 0) {
            const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' }[aa] || String(aa / 10).padStart(2, '0');
            this._text(name, x, cy + 26 * s, aa % 90 === 0 ? 18 : 14, aa % 90 === 0 ? '#ffd27d' : '#e8eef5', 'center', 700);
          }
        }
        // marcador de rumbo al destino
        const n = game.nav;
        let rb = n.brg - hd; while (rb > 180) rb -= 360; while (rb < -180) rb += 360;
        const bx = cx + Math.max(-54, Math.min(54, rb)) * ppd;
        g.fillStyle = '#ff5fd6';
        g.beginPath(); g.moveTo(bx, cy + ch - 16 * s); g.lineTo(bx - 7 * s, cy + ch - 2 * s); g.lineTo(bx + 7 * s, cy + ch - 2 * s); g.closePath(); g.fill();
        g.restore();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, cy + ch - 3 * s); g.lineTo(cx - 6 * s, cy + ch + 6 * s); g.lineTo(cx + 6 * s, cy + ch + 6 * s); g.closePath(); g.fill();
        // lectura de rumbo y destino
        this._panel(cx - 44 * s, cy - 34 * s, 88 * s, 30 * s, 6);
        this._text(`${String(Math.round(hd) % 360).padStart(3, '0')}°`, cx, cy - 12 * s, 19, '#fff', 'center', 700);
        const nm = n.dist / 1852;
        this._text(`${n.ident} · ${nm < 10 ? nm.toFixed(1) : nm.toFixed(0)} NM · ${String(Math.round(n.brg) % 360).padStart(3, '0')}°`, cx + 56 * s, cy - 12 * s, 13, '#ff9be6', 'left', 600);
      }

      // ---- horizonte mini (solo en vista exterior) ----
      if (this.mode === 2 && game.camCtl.mode !== 'cockpit') {
        const r = 38 * s, ax = pad + lw + pad + r, ay = by + bh / 2;
        if (ax + r < W / 2 - cw / 2 - 6) {
          g.save(); g.beginPath(); g.arc(ax, ay, r, 0, 7); g.clip();
          g.translate(ax, ay); g.rotate(-tel.roll); g.translate(0, (tel.pitch / RAD) * (r / 25));
          g.fillStyle = '#2f7fd6'; g.fillRect(-r * 3, -r * 4, r * 6, r * 4);
          g.fillStyle = '#7a4d22'; g.fillRect(-r * 3, 0, r * 6, r * 4);
          g.strokeStyle = '#fff'; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(-r * 3, 0); g.lineTo(r * 3, 0); g.stroke();
          for (const p of [-20, -10, 10, 20]) { const y = -p * (r / 25); g.beginPath(); g.moveTo(-8 * s, y); g.lineTo(8 * s, y); g.stroke(); }
          g.restore();
          g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(ax, ay, r, 0, 7); g.stroke();
          g.strokeStyle = '#ffb000'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(ax - 22 * s, ay); g.lineTo(ax - 8 * s, ay); g.moveTo(ax + 8 * s, ay); g.lineTo(ax + 22 * s, ay); g.stroke();
          g.fillStyle = '#ffb000'; g.beginPath(); g.arc(ax, ay, 2.5 * s, 0, 7); g.fill();
          // bola de resbale
          const bxx = ax + Math.max(-1, Math.min(1, tel.slipBall * 3)) * 20 * s;
          g.fillStyle = 'rgba(8,14,22,0.6)'; g.fillRect(ax - 26 * s, ay + r + 4 * s, 52 * s, 8 * s);
          g.fillStyle = '#fff'; g.beginPath(); g.arc(bxx, ay + r + 8 * s, 4 * s, 0, 7); g.fill();
        }
      }
    }
    if (this.showMap) this._map(game);
  }

  _map(game) {
    if (!this.mapImage) return;
    const g = this.g, c = this.canvas, s = this.s;
    const size = Math.min(c.height * 0.62, c.width * 0.5, 620 * s);
    const x0 = c.width - size - 18 * s, y0 = 70 * s;
    this._panel(x0 - 8 * s, y0 - 8 * s, size + 16 * s, size + 16 * s, 10);
    g.drawImage(this.mapImage, x0, y0, size, size);
    const P = (x, z) => [x0 + ((x - WORLD_MIN) / WORLD_SIZE) * size, y0 + ((z - WORLD_MIN) / WORLD_SIZE) * size];
    // aeródromos
    for (const a of AIRPORTS) {
      const [x, y] = P(a.x, a.z);
      g.save(); g.translate(x, y); g.rotate(a.heading * RAD);
      g.fillStyle = '#fff'; g.fillRect(-2 * s, -9 * s, 4 * s, 18 * s);
      g.restore();
      g.strokeStyle = '#35d0ff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 11 * s, 0, 7); g.stroke();
      this._text(a.id, x + 14 * s, y + 4 * s, 12, '#fff', 'left', 700);
    }
    if (this.waypoint) {
      const [x, y] = P(this.waypoint.x, this.waypoint.z);
      g.strokeStyle = '#ff5fd6'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 8 * s, 0, 7); g.stroke();
    }
    // traza
    if (this.trail.length > 1) {
      g.strokeStyle = 'rgba(255,230,120,0.9)'; g.lineWidth = 2;
      g.beginPath();
      this.trail.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); });
      g.stroke();
    }
    // avión
    const ac = game.ac;
    const [ax, ay] = P(ac.pos[0], ac.pos[2]);
    g.save(); g.translate(ax, ay); g.rotate(ac.tel.heading * RAD);
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -11 * s); g.lineTo(7 * s, 8 * s); g.lineTo(0, 4 * s); g.lineTo(-7 * s, 8 * s); g.closePath(); g.fill(); g.stroke();
    g.restore();
    this._text('N', x0 + size - 16 * s, y0 + 20 * s, 15, '#fff', 'center', 800);
  }
}
