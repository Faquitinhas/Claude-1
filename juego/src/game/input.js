// Entrada del jugador: teclado, ratón (mirar / modo yugo), mando y controles táctiles.
// Produce los mandos del avión (ac.input) con suavizado y ayudas opcionales.
import { clamp } from '../core/math.js';

export const FLAP_NOTCHES = [0, 1 / 3, 2 / 3, 1];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // teclas pulsadas en este frame
    this.stick = [0, 0];          // roll, pitch por teclado (suavizado)
    this.rudderKey = 0;
    this.throttle = 0;
    this.flapNotch = 0;
    this.trim = 0;
    this.brake = 0;
    this.parkBrake = true;
    this.mouseYoke = false;
    this.yoke = [0, 0];
    this.touch = { active: false, roll: 0, pitch: 0, yaw: 0, throttle: null, brake: 0 };
    this.pad = { active: false };
    this.assist = { autoRudder: true, stability: false };
    this.actions = [];            // acciones discretas para el juego: 'camera', 'pause', 'help', ...
    this.dragging = false;
    this.onDrag = null; this.onZoom = null;
    this.enabled = true;
    this._padPrev = [];
    this._starter = 0;
    this._gndHdg = null;
    this._gndInt = 0;
    this._bind();
  }

  _bind() {
    const kd = (e) => {
      if (e.repeat) { if (this._isGameKey(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code); this.pressed.add(e.code);
      if (this._isGameKey(e.code)) e.preventDefault();
    };
    const ku = (e) => { this.keys.delete(e.code); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => this.keys.clear());
    const c = this.canvas;
    let last = null;
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.dragging = true; last = [e.clientX, e.clientY];
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (document.pointerLockElement === c && this.mouseYoke) {
        this.yoke[0] = clamp(this.yoke[0] + e.movementX * 0.0035, -1, 1);
        this.yoke[1] = clamp(this.yoke[1] + e.movementY * 0.0035, -1, 1);
        return;
      }
      if (!this.dragging || !last) return;
      if (this.onDrag) this.onDrag(e.clientX - last[0], e.clientY - last[1]);
      last = [e.clientX, e.clientY];
    });
    const up = (e) => { if (e.pointerType !== 'touch') { this.dragging = false; last = null; } };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); if (this.onZoom) this.onZoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== c) { this.mouseYoke = false; this.yoke = [0, 0]; }
    });
  }

  _isGameKey(code) {
    return /^(Arrow|Key[WASDQEFVBTGCLMHPRYXZ]$|Space|Page|Digit|Numpad|Minus|Equal|Home|End|Tab|Bracket|Comma|Period)/.test(code);
  }

  toggleMouseYoke() {
    if (this.mouseYoke) { document.exitPointerLock(); this.mouseYoke = false; return false; }
    this.mouseYoke = true; this.yoke = [0, 0];
    if (this.canvas.requestPointerLock) this.canvas.requestPointerLock();
    return true;
  }

  // Sincroniza el estado interno con el avión (tras colocarlo para una misión).
  sync(ac) {
    this.throttle = ac.input.throttle;
    this.flapNotch = Math.round(ac.input.flaps * 3);
    this.trim = ac.input.trim;
    this.parkBrake = ac.input.parkBrake;
    this.stick = [0, 0]; this.yoke = [0, 0]; this.rudderKey = 0;
    this._gndHdg = null; this._gndInt = 0;
  }

  update(dt, ac) {
    const k = this.keys, pr = this.pressed, inp = ac.input, A = this.actions;
    const down = (...codes) => codes.some((c) => k.has(c));
    const hit = (...codes) => codes.some((c) => pr.has(c));
    // ---- acciones discretas ----
    if (hit('KeyC')) A.push('camera');
    if (hit('Escape', 'KeyP')) A.push('pause');
    if (hit('KeyH')) A.push('help');
    if (hit('KeyM')) A.push('map');
    if (hit('KeyL')) A.push('lights');
    if (hit('KeyY')) A.push('yoke');
    if (hit('KeyR')) A.push('restart');
    if (hit('KeyX')) A.push('resetView');
    if (hit('Tab')) A.push('panel');
    if (this.enabled) {
      if (hit('KeyF', 'BracketRight')) this.flapNotch = Math.min(3, this.flapNotch + 1);
      if (hit('KeyV', 'BracketLeft')) this.flapNotch = Math.max(0, this.flapNotch - 1);
      if (hit('KeyB')) this.parkBrake = !this.parkBrake;
      if (hit('KeyE')) A.push('engine');
      for (let d = 0; d <= 9; d++) if (hit('Digit' + d)) this.throttle = d === 0 ? 1 : d / 10;
    }
    // ---- ejes por teclado ----
    const tr = (down('ArrowRight') ? 1 : 0) - (down('ArrowLeft') ? 1 : 0);
    const tp = (down('ArrowDown') ? 1 : 0) - (down('ArrowUp') ? 1 : 0);
    // El teclado es todo o nada: la deflexión crece poco a poco (más despacio en cabeceo) y
    // vuelve sola al centro, para poder hacer correcciones finas con toques cortos.
    const ramp = (v, t, dtt, up) => {
      const rate = t === 0 ? 4.5 : (Math.sign(t) !== Math.sign(v) && v !== 0 ? 5.5 : up);
      return v + clamp(t - v, -rate * dtt, rate * dtt);
    };
    this.stick[0] = ramp(this.stick[0], tr, dt, 2.2);
    this.stick[1] = ramp(this.stick[1], tp, dt, 1.25);
    const ty = (down('KeyD', 'KeyE') && !0 ? 1 : 0) - (down('KeyA', 'KeyQ') ? 1 : 0);
    this.rudderKey = ramp(this.rudderKey, (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0), dt, 2.4);
    void ty;
    if (down('KeyW', 'PageUp', 'Equal', 'NumpadAdd')) this.throttle = Math.min(1, this.throttle + dt * 0.55);
    if (down('KeyS', 'PageDown', 'Minus', 'NumpadSubtract')) this.throttle = Math.max(0, this.throttle - dt * 0.55);
    if (down('KeyT', 'End')) this.trim = Math.min(1, this.trim + dt * 0.25);
    if (down('KeyG', 'Home')) this.trim = Math.max(-1, this.trim - dt * 0.25);
    this.brake = down('Space', 'Period') ? 1 : 0;

    let roll = this.stick[0], pitch = this.stick[1], yaw = this.rudderKey, brake = this.brake;
    if (this.mouseYoke) { roll = clamp(roll + this.yoke[0], -1, 1); pitch = clamp(pitch + this.yoke[1], -1, 1); }
    // ---- mando ----
    const gp = this._pollPad(dt);
    if (gp) {
      roll = clamp(roll + gp.roll, -1, 1); pitch = clamp(pitch + gp.pitch, -1, 1); yaw = clamp(yaw + gp.yaw, -1, 1);
      brake = Math.max(brake, gp.brake);
    }
    // ---- táctil ----
    const t = this.touch;
    if (t.active) {
      roll = clamp(roll + t.roll, -1, 1); pitch = clamp(pitch + t.pitch, -1, 1); yaw = clamp(yaw + t.yaw, -1, 1);
      if (t.throttle !== null) this.throttle = t.throttle;
      brake = Math.max(brake, t.brake);
    }
    if (!this.enabled) { roll = 0; pitch = 0; yaw = 0; }
    // ---- ayuda: timón automático ----
    if (this.assist.autoRudder && Math.abs(yaw) < 0.05) {
      const tel = ac.tel;
      if (tel.onGround) {
        // En tierra el alabeo dirige la rueda de morro. Sin entrada, la ayuda mantiene el rumbo
        // (contrarresta el par motor y la estela de la hélice, que tiran del morro a la izquierda).
        const gs = tel.groundSpeed;
        if (Math.abs(roll) > 0.06 || this._gndHdg === null || gs < 1.5) { this._gndHdg = tel.heading; this._gndInt = 0; }
        let err = this._gndHdg - tel.heading;
        err = ((err + 540) % 360) - 180;
        this._gndInt = clamp(this._gndInt + err * dt * 0.05, -0.4, 0.4);
        const hold = Math.abs(roll) > 0.06 ? 0 : err * 0.09 + this._gndInt;
        yaw = clamp(roll * (gs < 20 ? 1 : 20 / gs) + hold + ac.omega[1] * 0.7 * clamp(gs / 8, 0, 1), -1, 1);
      } else {
        this._gndHdg = null;
        yaw = clamp(tel.beta * 3.2 + ac.omega[1] * 0.35 + roll * 0.18, -1, 1);
      }
    } else this._gndHdg = null;
    // ---- ayuda (modo fácil): nivelado de alas y protección de pérdida ----
    if (this.assist.stability && this.enabled && !ac.tel.onGround) {
      const tel = ac.tel;
      if (Math.abs(roll) < 0.08) roll = clamp(-tel.roll * 2.0 + ac.omega[2] * 0.5, -0.7, 0.7);
      else if (Math.abs(tel.roll) > 0.8 && roll * tel.roll > 0) roll *= clamp(1 - (Math.abs(tel.roll) - 0.8) / 0.25, 0, 1);   // límite ~55° de alabeo
      const k = clamp((tel.stall - 0.3) / 0.4, 0, 1);
      if (k > 0) pitch = Math.min(pitch, pitch * (1 - k)) - 0.35 * k;
    }
    inp.roll = roll; inp.pitch = pitch; inp.yaw = yaw;
    inp.throttle = this.throttle;
    inp.flaps = FLAP_NOTCHES[this.flapNotch];
    inp.trim = this.trim;
    inp.brake = brake;
    inp.parkBrake = this.parkBrake;
    // arranque del motor: el motor de arranque actúa unos segundos
    if (this._starter > 0) { this._starter -= dt; inp.starter = true; if (ac.engine.running && ac.engine.rpm > 500) this._starter = 0; }
    else inp.starter = false;
    this.pressed.clear();
  }

  toggleEngine(ac) {
    if (ac.engine.running) { ac.input.ignition = false; this._starter = 0; return false; }
    ac.input.ignition = true; ac.input.mixture = 1; this._starter = 3.5;
    return true;
  }

  _pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected && p.axes.length >= 2) { gp = p; break; }
    if (!gp) { this.pad.active = false; return null; }
    this.pad.active = true;
    const dz = (v) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
    const b = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const was = this._padPrev;
    const hit = (i) => b(i) > 0.5 && !(was[i] > 0.5);
    this.throttle = clamp(this.throttle + (b(7) - b(6)) * dt * 0.7, 0, 1);
    if (hit(2)) this.flapNotch = Math.min(3, this.flapNotch + 1);
    if (hit(1)) this.flapNotch = Math.max(0, this.flapNotch - 1);
    if (hit(3)) this.actions.push('camera');
    if (hit(9)) this.actions.push('pause');
    this._padPrev = gp.buttons.map((x) => x.value);
    const rs = gp.axes.length >= 4 ? [dz(gp.axes[2]), dz(gp.axes[3])] : [0, 0];
    if (this.onDrag && this.pad.look) this.onDrag(rs[0] * 400 * dt, rs[1] * 300 * dt);
    return { roll: dz(gp.axes[0]), pitch: dz(gp.axes[1]), yaw: this.pad.look ? 0 : rs[0], brake: b(0) };
  }
}
