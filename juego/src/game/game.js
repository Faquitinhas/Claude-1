// Núcleo del juego: une el render, la física, la entrada y las cámaras.
import { initGL } from '../core/gl.js';
import { DEG } from '../core/math.js';
import { Renderer, QUALITY } from '../render/renderer.js';
import { createCamera, updateCamera } from '../render/camera.js';
import { Environment } from './env.js';
import { Aircraft, KT, FT, qrot } from '../aircraft/fdm.js';
import { WorldPhysics } from './worldPhysics.js';
import { Input } from './input.js';
import { CameraController } from './cameraCtl.js';
import { AIRPORTS, runwayEnd, runwayPoint, nearestAirport } from '../world/airports.js';
import { InstrumentPanel } from '../ui/panel.js';
import { Hud } from '../ui/hud.js';
import { makeMapImage } from '../world/mapImage.js';

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.gl = initGL(canvas);
    if (!this.gl) throw new Error('Tu navegador no soporta WebGL 2, necesario para el juego.');
    const q = { ...QUALITY[opts.quality || 'high'] };
    q.clouds = { ...q.clouds };
    Object.assign(q, opts.q || {});
    if (opts.cloudQ) Object.assign(q.clouds, opts.cloudQ);
    this.quality = q;
    this.renderer = new Renderer(this.gl, q);
    this.env = new Environment();
    this.ac = new Aircraft();
    this.cam = createCamera();
    this.camCtl = new CameraController();
    this.input = new Input(canvas);
    this.input.onDrag = (dx, dy) => this.camCtl.drag(dx, dy);
    this.input.onZoom = (f) => this.camCtl.zoom(f);
    this.panel = new InstrumentPanel();
    this.hud = opts.hudCanvas ? new Hud(opts.hudCanvas) : null;
    this.gpws = '';
    this._gpwsT = 0;
    this.nav = { target: null, ident: '----', name: '', brg: 0, dist: 0 };
    this._panelT = 0;
    this.paused = false;
    this.state = 'loading';
    this.time = 0;
    this.listeners = {};
    this.fps = 60;
    this._last = 0;
    this._raf = null;
  }

  on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); }
  emit(ev, data) { for (const fn of this.listeners[ev] || []) fn(data); }

  async init(onProgress) {
    await this.renderer.init(AIRPORTS, onProgress);
    this.world = new WorldPhysics(this.renderer.terrainData, this.env);
    if (this.hud) this.hud.mapImage = makeMapImage(this.gl, this.renderer.terrainData, 768);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.state = 'ready';
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr || 2);
    const w = Math.max(2, Math.round(c.clientWidth * dpr)), h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.renderer.resize(w, h);
    this.cam.aspect = w / h;
    if (this.hud) this.hud.resize();
  }

  // Coloca el avión. cfg: { airport, end, onRunway | approach(km) | air:{x,z,alt,heading,speed}, ... }
  placeAircraft(cfg) {
    const T = this.renderer.terrainData, ac = this.ac;
    if (cfg.air) {
      const a = cfg.air;
      ac.reset({ pos: [a.x, a.alt, a.z], heading: a.heading, speed: a.speed ?? 55, engineOn: cfg.engineOn !== false, throttle: a.throttle ?? 0.7, flaps: a.flaps ?? 0, fuel: cfg.fuel ?? 95 });
    } else {
      const ap = AIRPORTS.find((x) => x.id === (cfg.airport || 'HZPA')) || AIRPORTS[0];
      const end = runwayEnd(ap, cfg.end ?? 0);
      if (cfg.approach) {
        // en final, a 'approach' km del umbral, sobre la senda de 3°
        const d = cfg.approach * 1000;
        const s = cfg.end === 1 ? 1 : -1;
        const [x, z] = runwayPoint(ap, s * (ap.length / 2 + d), cfg.offset ?? 0);
        const alt = ap.elev + Math.tan(3 * DEG) * (d + 300) + 15;
        ac.reset({ pos: [x, alt, z], heading: end.heading, speed: (cfg.speed ?? 70) * KT, engineOn: cfg.engineOn !== false, throttle: cfg.throttle ?? 0.42, flaps: cfg.flaps ?? 2 / 3, fuel: cfg.fuel ?? 60 });
      } else {
        const s = cfg.end === 1 ? 1 : -1;
        const [x, z] = runwayPoint(ap, s * (ap.length / 2 - 55));
        const y = T.height(x, z) + 1.13;
        ac.reset({ pos: [x, y, z], heading: end.heading, speed: 0, engineOn: cfg.engineOn !== false, throttle: 0, flaps: cfg.flaps ?? 0, fuel: cfg.fuel ?? 95 });
        ac.input.parkBrake = true;
      }
    }
    this.input.sync(ac);
    this.camCtl.heading = null;
    this.camCtl.flyPos = null;
    this.renderer.exposureReady = 0;
  }

  step(dt) {
    this.update(dt);
    this.render(dt);
  }

  // Lógica: entrada, física, cámara y avisos (sin dibujar).
  update(dt) {
    const { ac, env, input, cam, camCtl, renderer } = this;
    this.time += dt;
    env.update(this.paused ? 0 : dt);
    input.enabled = this.state === 'flying' && !this.paused;
    if (this.state === 'flying') input.update(dt, ac); else { input.pressed.clear(); }
    for (const a of input.actions) this.handleAction(a);
    input.actions.length = 0;
    // velocidad de la cámara (para el efecto Doppler del sonido)
    const cp = this.cam.pos;
    if (this._camPrev && dt > 0) this.camVel = [(cp[0] - this._camPrev[0]) / dt, (cp[1] - this._camPrev[1]) / dt, (cp[2] - this._camPrev[2]) / dt];
    this._camPrev = [cp[0], cp[1], cp[2]];
    if (!this.paused && (this.state === 'flying' || this.state === 'menu')) {
      ac.update(dt, this.world);
      for (const e of ac.events) this.emit('acEvent', e);
      ac.events.length = 0;
    }
    renderer.aircraft.update(ac, this.paused ? 0 : dt);
    this.updateNav();
    camCtl.update(cam, ac, dt, renderer.terrainData);
    this.updateGpws(dt);
    this.emit('frame', dt);
  }

  render(dt) {
    const { ac, env, cam, camCtl, renderer } = this;
    // El panel solo se redibuja (30 Hz) cuando se ve desde la cabina.
    this._panelT -= dt;
    if (camCtl.mode === 'cockpit' && (this._panelT <= 0 || dt === 0)) {
      this.panel.draw(ac, Math.max(dt, 1 / 30), env, this.nav);
      renderer.aircraft.updatePanel(this.panel.canvas);
      this._panelT = 1 / 30;
    }
    // iluminación integral del tablero al anochecer
    renderer.aircraft.panelGlow = 0.5 * Math.min(Math.max((0.12 - env.sunDir[1]) / 0.2, 0), 1);
    renderer.clear = renderer.clearance(cam.pos);
    const ext = camCtl.mode !== 'cockpit';
    cam.near = camCtl.mode === 'cockpit' ? Math.min(Math.max(renderer.clear * 0.2, 0.5), 30) : Math.min(Math.max(renderer.clear * 0.2, 0.4), ext && camCtl.mode !== 'free' ? 1.2 : 40);
    updateCamera(cam);
    renderer.aircraft.visible = camCtl.mode !== 'free' || this.showAircraftInFree;
    // faro de aterrizaje: ilumina el terreno por delante del avión
    const sp = renderer.spot;
    if (renderer.aircraft.lightsOn && ac.engine.rpm > 300 && !ac.crashed) {
      const o = qrot(ac.q, [0, -0.3, -2.0]);
      sp.pos = [ac.pos[0] + o[0], ac.pos[1] + o[1], ac.pos[2] + o[2]];
      sp.dir = qrot(ac.q, [0, -0.07, -0.9975]);
      sp.intensity = 1.3;
    } else sp.intensity = 0;
    renderer.render(cam, env, dt, {
      shadow: (ctx) => renderer.aircraft.renderShadow(ctx, ac.pos, ac.q),
      near: (ctx) => this.drawNear(ctx),
    });
    if (this.hud) this.hud.draw(this, dt);
  }

  // Aviso de proximidad al terreno: predice la trayectoria unos segundos por delante.
  updateGpws(dt) {
    this._gpwsT -= dt;
    if (this._gpwsT > 0) return;
    this._gpwsT = 0.25;
    const ac = this.ac, tel = ac.tel, T = this.renderer.terrainData;
    this.gpws = '';
    if (this.state !== 'flying' || tel.onGround || ac.crashed || tel.agl < 6) return;
    const nearField = this.nav.dist < 3500 && (ac.ctl.flaps > 0.1 || tel.ias < 46);
    const v = ac.vel, p = ac.pos;
    for (let t = 2; t <= 14; t += 2) {
      const x = p[0] + v[0] * t, z = p[2] + v[2] * t, y = p[1] + v[1] * t;
      const g = Math.max(T.heightNearest(x, z), 0);
      if (y < g + 25) {
        if (!(nearField && t > 5)) this.gpws = t <= 7 ? '¡TERRENO! ¡ASCIENDA!' : 'TERRENO';
        break;
      }
    }
    if (!this.gpws && !nearField && tel.agl < 300 && tel.vs < -9) this.gpws = 'RÉGIMEN DE DESCENSO';
  }

  // Destino de navegación (para el GPS y el HUD): el aeródromo elegido o el más cercano.
  updateNav() {
    const p = this.ac.pos, n = this.nav;
    const ap = n.target || nearestAirport(p[0], p[2]).airport;
    n.ident = ap.id; n.name = ap.name;
    n.dist = Math.hypot(ap.x - p[0], ap.z - p[2]);
    n.brg = ((Math.atan2(ap.x - p[0], -(ap.z - p[2])) * 180) / Math.PI + 360) % 360;
    n.airport = ap;
  }

  drawNear(ctx) {
    const r = this.renderer, gl = this.gl;
    if (this.camCtl.mode === 'cockpit') {
      // La cabina se dibuja con su propio rango de profundidad, siempre por delante del mundo.
      const c = this.cam;
      const save = [c.near, c.far];
      c.near = 0.06; c.far = 60;
      updateCamera(c);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      r.aircraft.render(ctx, { cockpit: true });
      c.near = save[0]; c.far = save[1];
      updateCamera(c);
    } else {
      r.aircraft.render(ctx);
    }
  }

  handleAction(a) {
    if (a === 'camera') { this.camCtl.next(); this.emit('camera', this.camCtl.mode); }
    else if (a === 'resetView') this.camCtl.resetView();
    else if (a === 'engine') { const on = this.input.toggleEngine(this.ac); this.emit('engine', on); }
    else if (a === 'lights') { const r = this.renderer.aircraft; r.lightsOn = r.lightsOn ? 0 : 1; }
    else if (a === 'yoke') this.emit('yoke', this.input.toggleMouseYoke());
    else if (a === 'map' && this.hud) this.hud.showMap = !this.hud.showMap;
    else if (a === 'panel' && this.hud) this.hud.mode = (this.hud.mode + 2) % 3;
    else this.emit('action', a);
  }

  start() {
    const loop = (now) => {
      const dt = Math.min((now - this._last) / 1000 || 0.016, 0.1);
      this._last = now;
      this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
      if (!this.frozen) this.step(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
}

export { KT, FT };
