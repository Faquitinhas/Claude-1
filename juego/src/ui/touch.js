// Controles táctiles: palanca virtual (cabeceo/alabeo), palanca de gases, timón,
// botones de flaps, frenos y vista. Arrastrar sobre la escena mueve la cámara.
import { clamp } from '../core/math.js';

export class TouchControls {
  constructor(root, canvas, game) {
    this.root = root;
    this.game = game;
    this.enabled = false;
    const inp = game.input;
    root.innerHTML = `
      <div class="thr"><b></b><i></i><span>GASES</span></div>
      <div class="rud"><span><em>◄</em><em>TIMÓN</em><em>►</em></span><i></i></div>
      <div class="stick"><i></i></div>
      <div class="tb" data-b="flapUp" style="right:calc(190px + var(--sar));bottom:calc(120px + var(--sab))">FLAPS ▲</div>
      <div class="tb" data-b="flapDn" style="right:calc(190px + var(--sar));bottom:calc(68px + var(--sab))">FLAPS ▼</div>
      <div class="tb" data-b="brake" style="right:calc(190px + var(--sar));bottom:calc(16px + var(--sab))">FRENO</div>
      <div class="tb" data-b="park" style="left:calc(86px + var(--sal));bottom:calc(16px + var(--sab))">FRENO EST.</div>
      <div class="tb" data-b="engine" style="left:calc(86px + var(--sal));bottom:calc(68px + var(--sab))">MOTOR</div>`;
    const $ = (s) => root.querySelector(s);
    // ---- palanca ----
    const stick = $('.stick'), knob = stick.querySelector('i');
    let sid = null;
    const sMove = (e) => {
      const r = stick.getBoundingClientRect();
      const R = r.width / 2;
      let x = (e.clientX - (r.left + R)) / (R * 0.72), y = (e.clientY - (r.top + R)) / (R * 0.72);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      // respuesta progresiva: más precisión cerca del centro
      inp.touch.roll = Math.sign(x) * Math.pow(Math.abs(x), 1.5);
      inp.touch.pitch = Math.sign(y) * Math.pow(Math.abs(y), 1.5);
      knob.style.transform = `translate(${x * R * 0.6}px,${y * R * 0.6}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); sMove(e); e.preventDefault(); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) sMove(e); });
    const sEnd = (e) => { if (e.pointerId !== sid) return; sid = null; inp.touch.roll = 0; inp.touch.pitch = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', sEnd); stick.addEventListener('pointercancel', sEnd);
    // ---- gases ----
    const thr = $('.thr'), fill = thr.querySelector('b'), tk = thr.querySelector('i');
    this._thrUI = (v) => { fill.style.height = `${v * 100}%`; tk.style.bottom = `${v * 100}%`; };
    let tid = null;
    const tMove = (e) => {
      const r = thr.getBoundingClientRect();
      const v = clamp(1 - (e.clientY - r.top - 13) / (r.height - 26), 0, 1);
      inp.touch.throttle = v; inp.throttle = v;
      this._thrUI(v);
    };
    thr.addEventListener('pointerdown', (e) => { tid = e.pointerId; thr.setPointerCapture(tid); tMove(e); e.preventDefault(); });
    thr.addEventListener('pointermove', (e) => { if (e.pointerId === tid) tMove(e); });
    const tEnd = (e) => { if (e.pointerId === tid) { tid = null; inp.touch.throttle = null; } };
    thr.addEventListener('pointerup', tEnd); thr.addEventListener('pointercancel', tEnd);
    // ---- timón ----
    const rud = $('.rud'), rk = rud.querySelector('i');
    let rid = null;
    const rMove = (e) => {
      const r = rud.getBoundingClientRect();
      const v = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 22), -1, 1);
      inp.touch.yaw = v; rk.style.transform = `translateX(${v * (r.width / 2 - 24)}px)`;
    };
    rud.addEventListener('pointerdown', (e) => { rid = e.pointerId; rud.setPointerCapture(rid); rMove(e); e.preventDefault(); });
    rud.addEventListener('pointermove', (e) => { if (e.pointerId === rid) rMove(e); });
    const rEnd = (e) => { if (e.pointerId !== rid) return; rid = null; inp.touch.yaw = 0; rk.style.transform = ''; };
    rud.addEventListener('pointerup', rEnd); rud.addEventListener('pointercancel', rEnd);
    // ---- botones ----
    this.parkBtn = root.querySelector('[data-b=park]');
    root.querySelectorAll('.tb').forEach((b) => {
      const k = b.dataset.b;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (k === 'flapUp') inp.flapNotch = Math.max(0, inp.flapNotch - 1);
        else if (k === 'flapDn') inp.flapNotch = Math.min(3, inp.flapNotch + 1);
        else if (k === 'brake') { inp.touch.brake = 1; b.classList.add('on'); }
        else if (k === 'park') inp.parkBrake = !inp.parkBrake;
        else if (k === 'engine') inp.actions.push('engine');
      });
      const end = () => { if (k === 'brake') { inp.touch.brake = 0; b.classList.remove('on'); } };
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('pointerleave', end);
    });
    // ---- cámara: arrastrar con un dedo, pellizcar para el zoom ----
    const pts = new Map();
    let pinch = 0;
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; } });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId);
      if (pts.size === 1) game.camCtl.drag((e.clientX - p[0]) * 1.4, (e.clientY - p[1]) * 1.4);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch > 0 && d > 0) game.camCtl.zoom(pinch / d);
        pinch = d;
      }
    });
    const cEnd = (e) => { pts.delete(e.pointerId); pinch = 0; };
    canvas.addEventListener('pointerup', cEnd); canvas.addEventListener('pointercancel', cEnd);
    this.show(false);
  }

  show(on) {
    this.enabled = on;
    this.root.style.display = on ? '' : 'none';
    this.game.input.touch.active = on;
    if (!on) { const t = this.game.input.touch; t.roll = t.pitch = t.yaw = 0; t.brake = 0; t.throttle = null; }
  }

  // Refleja el estado (gases, freno de estacionamiento) en los controles.
  sync() {
    if (!this.enabled) return;
    this._thrUI(this.game.input.throttle);
    this.parkBtn.classList.toggle('on', this.game.input.parkBrake);
  }
}
