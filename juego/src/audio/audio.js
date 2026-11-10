// Sonido procedural con Web Audio: nada de muestras grabadas, todo se sintetiza.
//  - Motor bóxer de 4 cilindros: armónicos de la frecuencia de encendido y de los órdenes
//    medios (el "traqueteo" característico), más ruido de escape modulado.
//  - Hélice bipala: frecuencia de paso de pala, más brillante con la velocidad de punta.
//  - Efecto Doppler y atenuación con la distancia en las cámaras exteriores.
//  - Viento aerodinámico, rodadura, chirrido de neumáticos, avisador de pérdida, flaps,
//    motor de arranque, alarma de terreno e impactos.
import { clamp } from '../core/math.js';
import { KT, SPEC } from '../aircraft/fdm.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volume = 0.8;
    this.muted = false;
    this._lastFlaps = 0;
    this._gpwsT = 0;
    this._wasCrashed = false;
  }

  // Debe llamarse tras un gesto del usuario (política de reproducción automática).
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const now = ctx.currentTime;
    // ---- cadena maestra ----
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    // ---- ruido blanco en bucle ----
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(now); return s; };

    // ---- motor ----
    const N = 28, re = new Float32Array(N), im = new Float32Array(N);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let n = 1; n < N; n++) {
      const a = (1 / Math.pow(n, 0.85)) * (0.55 + 0.9 * rnd()) * (n % 2 === 0 ? 1.15 : 0.9);
      const ph = rnd() * Math.PI * 2;
      re[n] = a * Math.cos(ph); im[n] = a * Math.sin(ph);
    }
    const wave = ctx.createPeriodicWave(re, im);
    this.eng = [];
    this.engBus = ctx.createGain(); this.engBus.gain.value = 0;
    for (const [mult, g] of [[1, 0.55], [0.5, 0.42], [0.25, 0.16], [2, 0.12]]) {
      const o = ctx.createOscillator(); o.setPeriodicWave(wave); o.frequency.value = 20 * mult;
      const gn = ctx.createGain(); gn.gain.value = g;
      o.connect(gn); gn.connect(this.engBus); o.start(now);
      this.eng.push({ o, mult, gn, base: g });
    }
    // ruido de escape modulado por el encendido
    const en = noise();
    this.exBP = ctx.createBiquadFilter(); this.exBP.type = 'bandpass'; this.exBP.frequency.value = 420; this.exBP.Q.value = 0.7;
    this.exAM = ctx.createGain(); this.exAM.gain.value = 0.5;
    this.exLFO = ctx.createOscillator(); this.exLFO.type = 'sawtooth'; this.exLFO.frequency.value = 20;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    this.exLFO.connect(lfoG); lfoG.connect(this.exAM.gain); this.exLFO.start(now);
    this.exGain = ctx.createGain(); this.exGain.gain.value = 0.5;
    en.connect(this.exBP); this.exBP.connect(this.exAM); this.exAM.connect(this.exGain); this.exGain.connect(this.engBus);
    // saturación suave + filtro según la carga
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    this.engLP = ctx.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.frequency.value = 800; this.engLP.Q.value = 0.4;
    this.engHP = ctx.createBiquadFilter(); this.engHP.type = 'highpass'; this.engHP.frequency.value = 28;
    this.engOut = ctx.createGain(); this.engOut.gain.value = 0;
    this.engBus.connect(shaper); shaper.connect(this.engLP); this.engLP.connect(this.engHP); this.engHP.connect(this.engOut); this.engOut.connect(this.master);

    // ---- hélice ----
    this.propO = ctx.createOscillator(); this.propO.type = 'sawtooth'; this.propO.frequency.value = 20;
    this.propBP = ctx.createBiquadFilter(); this.propBP.type = 'bandpass'; this.propBP.frequency.value = 300; this.propBP.Q.value = 0.8;
    this.propG = ctx.createGain(); this.propG.gain.value = 0;
    this.propO.connect(this.propBP); this.propBP.connect(this.propG); this.propG.connect(this.master); this.propO.start(now);

    // ---- viento ----
    const wn = noise();
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 400; this.windBP.Q.value = 0.5;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    wn.connect(this.windBP); this.windBP.connect(this.windG); this.windG.connect(this.master);
    const wn2 = noise();
    this.rumbleLP = ctx.createBiquadFilter(); this.rumbleLP.type = 'lowpass'; this.rumbleLP.frequency.value = 90;
    this.rumbleG = ctx.createGain(); this.rumbleG.gain.value = 0;
    wn2.connect(this.rumbleLP); this.rumbleLP.connect(this.rumbleG); this.rumbleG.connect(this.master);

    // ---- rodadura ----
    const rn = noise();
    this.rollLP = ctx.createBiquadFilter(); this.rollLP.type = 'lowpass'; this.rollLP.frequency.value = 180;
    this.rollG = ctx.createGain(); this.rollG.gain.value = 0;
    rn.connect(this.rollLP); this.rollLP.connect(this.rollG); this.rollG.connect(this.master);
    // derrape
    const sn = noise();
    this.skidBP = ctx.createBiquadFilter(); this.skidBP.type = 'bandpass'; this.skidBP.frequency.value = 1500; this.skidBP.Q.value = 3;
    this.skidG = ctx.createGain(); this.skidG.gain.value = 0;
    sn.connect(this.skidBP); this.skidBP.connect(this.skidG); this.skidG.connect(this.master);

    // ---- avisador de pérdida ----
    this.stallG = ctx.createGain(); this.stallG.gain.value = 0;
    const sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 1300; sbp.Q.value = 1.2;
    for (const f of [437, 444, 881]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(sbp); o.start(now); }
    sbp.connect(this.stallG); this.stallG.connect(this.master);

    // ---- flaps (motor eléctrico) ----
    this.flapG = ctx.createGain(); this.flapG.gain.value = 0;
    const fo = ctx.createOscillator(); fo.type = 'sawtooth'; fo.frequency.value = 310;
    const fbp = ctx.createBiquadFilter(); fbp.type = 'bandpass'; fbp.frequency.value = 900; fbp.Q.value = 2;
    fo.connect(fbp); fbp.connect(this.flapG); this.flapG.connect(this.master); fo.start(now);

    // ---- motor de arranque ----
    this.startG = ctx.createGain(); this.startG.gain.value = 0;
    const so = ctx.createOscillator(); so.type = 'sawtooth'; so.frequency.value = 95;
    const sam = ctx.createGain(); sam.gain.value = 0.5;
    const slfo = ctx.createOscillator(); slfo.type = 'sine'; slfo.frequency.value = 7.5;
    const slg = ctx.createGain(); slg.gain.value = 0.5; slfo.connect(slg); slg.connect(sam.gain); slfo.start(now);
    const sbp2 = ctx.createBiquadFilter(); sbp2.type = 'bandpass'; sbp2.frequency.value = 500; sbp2.Q.value = 1;
    so.connect(sam); sam.connect(sbp2); sbp2.connect(this.startG); this.startG.connect(this.master); so.start(now);

    // ---- alarma (terreno) ----
    this.alarmG = ctx.createGain(); this.alarmG.gain.value = 0;
    this.alarmO = ctx.createOscillator(); this.alarmO.type = 'square'; this.alarmO.frequency.value = 960;
    const abp = ctx.createBiquadFilter(); abp.type = 'lowpass'; abp.frequency.value = 2400;
    this.alarmO.connect(abp); abp.connect(this.alarmG); this.alarmG.connect(this.master); this.alarmO.start(now);

    this.ready = true;
  }

  setVolume(v) { this.volume = v; }

  // Sonidos puntuales
  _burst({ freq = 1200, q = 1.5, gain = 0.4, dur = 0.2, type = 'bandpass' }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _thump(gain = 0.5, freq = 60, dur = 0.3) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t); o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  touchdown(vs, surface) {
    const k = clamp(vs / 3, 0.15, 1.3);
    if (surface === 'asphalt') this._burst({ freq: 1500, q: 2.5, gain: 0.32 * k, dur: 0.16 });
    else this._burst({ freq: 420, q: 0.8, gain: 0.3 * k, dur: 0.25, type: 'lowpass' });
    this._thump(0.5 * k, 58, 0.28);
  }
  crash() {
    this._burst({ freq: 300, q: 0.5, gain: 0.9, dur: 1.2, type: 'lowpass' });
    this._burst({ freq: 2200, q: 0.7, gain: 0.5, dur: 0.5 });
    this._thump(0.9, 45, 0.6);
  }
  click() { this._burst({ freq: 2600, q: 4, gain: 0.12, dur: 0.04 }); }

  // Actualiza todos los parámetros a partir del estado del juego.
  update(game, dt) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, ac = game.ac, tel = ac.tel, eng = ac.engine;
    const set = (p, v, tc = 0.05) => p.setTargetAtTime(v, t, tc);
    const active = game.state === 'flying' && !game.paused && !this.muted;
    set(this.master.gain, active ? this.volume : 0, 0.12);
    if (!active) return;
    const inside = game.camCtl.mode === 'cockpit';
    // distancia y Doppler respecto a la cámara
    const cam = game.cam.pos, p = ac.pos;
    const dx = p[0] - cam[0], dy = p[1] - cam[1], dz = p[2] - cam[2];
    const dist = Math.max(Math.hypot(dx, dy, dz), 1);
    let doppler = 1, att = 1;
    if (!inside) {
      const cv = game.camVel || [0, 0, 0];
      const vr = ((ac.vel[0] - cv[0]) * dx + (ac.vel[1] - cv[1]) * dy + (ac.vel[2] - cv[2]) * dz) / dist; // + = se aleja
      doppler = clamp(340 / (340 + vr), 0.6, 1.7);
      att = Math.pow(clamp(16 / dist, 0, 1), 0.85);
    }
    // ---- motor ----
    const rpm = eng.rpm;
    const fire = Math.max((rpm / 30) * doppler, 4);        // Hz: 2 encendidos por vuelta
    for (const e of this.eng) set(e.o.frequency, fire * e.mult, 0.03);
    set(this.exLFO.frequency, fire, 0.03);
    const load = eng.running ? clamp(ac.ctl.throttle * 0.85 + 0.15, 0, 1) : 0;
    const spin = clamp(rpm / 600, 0, 1);
    const run = eng.running ? 1 : 0.25;
    // a ralentí dominan los órdenes medios (traqueteo); a potencia, el encendido
    set(this.eng[1].gn.gain, this.eng[1].base * (1.3 - 0.7 * load));
    set(this.eng[2].gn.gain, this.eng[2].base * (1.6 - 1.2 * load));
    set(this.engBus.gain, (0.25 + 0.75 * load) * spin * run);
    set(this.exGain.gain, 0.25 + 0.9 * load);
    set(this.exBP.frequency, (300 + 700 * load) * (inside ? 0.8 : 1.2));
    set(this.engLP.frequency, inside ? 500 + 1300 * load : 900 + 3600 * load, 0.08);
    set(this.engOut.gain, (inside ? 0.42 : 0.62 * att) * (0.35 + 0.65 * load));
    // ---- hélice ----
    const tip = clamp(rpm / 2700, 0, 1.2);
    set(this.propO.frequency, fire, 0.03);
    set(this.propBP.frequency, clamp(fire * (2.5 + 3 * tip), 60, 3000));
    set(this.propG.gain, Math.pow(tip, 3.2) * (inside ? 0.10 : 0.26 * att));
    // ---- viento ----
    const v = tel.tas;
    const q = clamp((v / (SPEC.vne * KT)) ** 2, 0, 1.4);
    set(this.windBP.frequency, 250 + v * 9 + (inside ? 0 : 300), 0.1);
    set(this.windG.gain, q * (inside ? 0.5 : 0.22 * att) + (inside ? 0 : 0.012), 0.1);
    set(this.rumbleLP.frequency, 60 + v * 1.2);
    set(this.rumbleG.gain, (inside ? 0.5 : 0.0) * q + (tel.stall > 0.9 && !tel.onGround ? 0.5 * (inside ? 1 : 0.3) : 0), 0.1); // bataneo en la pérdida
    // ---- rodadura y derrape ----
    let roll = 0, skid = 0, rough = 0;
    for (const g of ac.gear) {
      if (!g.onGround) continue;
      const sp = Math.abs(g.spin * g.radius);
      const soft = g.surface !== 'asphalt';
      roll = Math.max(roll, clamp(sp / 35, 0, 1) * (soft ? 1.0 : 0.45));
      rough = Math.max(rough, soft ? 1 : 0);
      skid = Math.max(skid, clamp((g.slip - 0.12) * 5, 0, 1) * clamp(sp / 6, 0, 1) * (soft ? 0.2 : 1));
    }
    set(this.rollLP.frequency, 110 + rough * 160 + tel.groundSpeed * 2);
    set(this.rollG.gain, roll * (inside ? 0.55 : 0.4 * att), 0.06);
    set(this.skidG.gain, skid * 0.16 * (inside ? 0.7 : att), 0.04);
    // ---- avisador de pérdida ----
    set(this.stallG.gain, tel.stallWarn && inside ? 0.11 : tel.stallWarn ? 0.03 : 0, 0.03);
    // ---- flaps ----
    const moving = Math.abs(ac.ctl.flaps - this._lastFlaps) > 1e-5;
    this._lastFlaps = ac.ctl.flaps;
    set(this.flapG.gain, moving ? (inside ? 0.035 : 0.012 * att) : 0, 0.05);
    // ---- arranque ----
    set(this.startG.gain, ac.input.starter && rpm < 450 ? 0.12 * (inside ? 1 : att) : 0, 0.04);
    // ---- alarma de terreno ----
    this._gpwsT += dt;
    const al = game.gpws && game.gpws.startsWith('¡') && inside;
    const on = al && (this._gpwsT % 0.5) < 0.28;
    set(this.alarmO.frequency, (this._gpwsT % 1.0) < 0.5 ? 960 : 720, 0.005);
    set(this.alarmG.gain, on ? 0.05 : 0, 0.01);
    // ---- accidente ----
    if (ac.crashed && !this._wasCrashed) this.crash();
    this._wasCrashed = ac.crashed;
  }
}
