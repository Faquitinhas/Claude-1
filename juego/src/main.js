// Horizonte — arranque y flujo del juego (carga, menú, vuelo, pausa, resultado).
import { Game, KT, FT } from './game/game.js';
import { Shell } from './ui/shell.js';
import { Store } from './game/store.js';
import { MissionRunner, MISSIONS, FREE_FLIGHT } from './game/missions.js';
import { AudioEngine } from './audio/audio.js';
import { TouchControls } from './ui/touch.js';
import { AIRPORTS } from './world/airports.js';

const qs = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const isTouch = qs.has('touch') || (window.matchMedia && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);

const store = new Store({
  quality: isTouch ? 'medium' : 'high', autoRes: 1, clouds: 1, volume: 0.8, autoRudder: 1, damage: 1, timeScale: 1,
});
// Los ajustes guardados por versiones anteriores usaban una calidad por defecto más baja.
if (store.settings.gfx !== 2) { store.settings.gfx = 2; store.settings.quality = isTouch ? 'medium' : 'high'; store.save(); }
// Si el arranque anterior no terminó (p. ej. la GPU se quedó sin memoria), bajar un nivel de calidad.
const ORDER = ['low', 'medium', 'high', 'ultra'];
try {
  if (localStorage.getItem('horizonte-boot') === '1' && !qs.get('q')) {
    const i = ORDER.indexOf(store.settings.quality);
    if (i > 0) { store.settings.quality = ORDER[i - 1]; store.save(); }
  }
  localStorage.setItem('horizonte-boot', '1');
} catch (e) { /* sin almacenamiento */ }

const STAGES = [[0.25, 'Esculpiendo la isla…'], [0.5, 'Erosionando las montañas…'], [0.75, 'Calculando relieve y bosques…'], [0.99, 'Formando las nubes…'], [2, 'Preparando el avión…']];

async function boot() {
  let game, shell, runner, audio, touch;
  let mission = null;
  const handlers = {};
  shell = new Shell($('ui'), store, handlers);
  shell.isTouch = isTouch;
  shell.loading(0, 'Iniciando…');

  const q = {}, cloudQ = {};
  if (qs.get('N')) q.N = +qs.get('N');
  if (qs.get('M')) q.M = +qs.get('M');
  if (qs.get('scale')) q.scale = +qs.get('scale');
  if (qs.get('cres')) cloudQ.res = +qs.get('cres');
  if (qs.get('csteps')) cloudQ.steps = +qs.get('csteps');
  const quality = qs.get('q') || store.settings.quality;
  if (qs.has('rgba')) (await import('./world/terrainGen.js')).TerrainData.forceRGBA = true;   // prueba del formato alternativo
  game = new Game(canvas, { quality, q, cloudQ, hudCanvas: $('hud'), maxDpr: { low: 1.5, medium: 2, high: 2, ultra: 2.5 }[quality] || 1.5 });
  const env = game.env;
  audio = new AudioEngine();
  runner = new MissionRunner(game);
  touch = new TouchControls($('touch'), canvas, game);

  await game.init((f) => shell.loading(f, STAGES.find((s) => f < s[0])[1]));
  try { localStorage.removeItem('horizonte-boot'); } catch (e) { /* ignorar */ }
  console.log(`init ok, calidad=${quality}, maxH=${game.renderer.terrainData.maxHeight.toFixed(0)}`);
  game.hud.touchUI = isTouch;
  document.body.classList.toggle('touch', isTouch);
  game.hud.resize();
  game.baseScale = game.quality.scale;

  // ---------- ajustes ----------
  handlers.applySettings = () => {
    const s = store.settings;
    audio.setVolume(s.volume);
    game.input.assist.autoRudder = !!s.autoRudder;
    game.renderer.clouds.enabled = !!s.clouds;
    env.timeScale = s.timeScale;
    game.ac.noDamage = !s.damage;
    if (!s.autoRes && game.quality.scale !== game.baseScale) { game.quality.scale = game.baseScale; game.resize(); }
  };
  handlers.reload = () => location.reload();
  handlers.click = () => { audio.init(); audio.click(); };

  // ---------- menú con la escena en vivo ----------
  const applyEnv = (e) => {
    env.timeOfDay = e.time; env.clouds.coverage = e.coverage; env.haze = e.haze;
    env.wind = { ...e.wind }; env.turbulenceScale = e.turbulence ?? 1;
    env.update(0);
    game.renderer.exposureReady = 0;
  };
  const toMenu = () => {
    mission = null; runner.stop();
    game.state = 'menu'; game.paused = false;
    applyEnv({ time: 17.4, coverage: 0.32, haze: 3, wind: { dir: 70, speed: 3 } });
    game.placeAircraft({ airport: 'HZPA', end: 0 });
    game.camCtl.mode = 'chase'; game.camCtl.resetView(); game.camCtl.orbitYaw = 2.5; game.camCtl.orbitPitch = -0.02; game.camCtl.dist = 13;
    game.hud.objective = ''; game.hud.subtitle = ''; game.hud.showMap = false; game.hud.trail.length = 0;
    $('fly').classList.add('hidden'); $('hint').classList.add('hidden');
    touch.show(false);
    shell.menu();
  };
  handlers.preview = (f) => {
    if (!f) return;
    applyEnv({ time: f.time, coverage: f.sky, haze: f.vis, wind: { dir: 70, speed: f.wind } });
    const ap = AIRPORTS.find((a) => a.id === f.airport);
    if (ap && game.nav.airport !== ap) game.placeAircraft({ airport: f.airport, end: f.end });
  };

  // ---------- misión ----------
  const setHint = (text) => { const h = $('hint'); if (text) { h.textContent = text; h.classList.remove('hidden'); } else h.classList.add('hidden'); };
  runner.onUpdate = (text, hint, i, n) => {
    game.hud.objective = text ? (n ? `${Math.min(i + 1, n)}/${n} · ${text}` : text) : '';
    setHint(hint ? (isTouch ? hint.touch : hint.key) : '');
  };
  runner.onLanding = (sc) => {
    game.hud.message(`Aterrizaje en ${sc.airport.name}: ${sc.total}/100 ${'★'.repeat(sc.stars)}${'☆'.repeat(3 - sc.stars)} · ${Math.round(sc.fpm)} ft/min`, 8, '#b8ffb0');
    store.record('libre', sc.total, sc.stars);
  };
  let endTimer = null;
  runner.onEnd = (r) => {
    if (r.soft) { store.record(mission.id, 100, 3); return; }
    if (r.ok) store.record(mission.id, r.total, r.stars);
    const m = mission;
    clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      if (mission !== m) return;
      game.paused = true;
      $('fly').classList.add('hidden'); setHint(''); touch.show(false);
      shell.result({ ...r, crash: !r.ok && game.ac.crashed }, m);
    }, r.ok ? 1400 : 2600);
  };
  game.on('acEvent', (e) => {
    runner.onEvent(e);
    if (e.type === 'touch') audio.touchdown(e.vs, e.surface);
    if (e.type === 'gearCollapse') game.hud.message('¡Tren de aterrizaje dañado!', 4, '#ff8a7a');
    if (e.type === 'propStrike') game.hud.message('La hélice ha golpeado el suelo', 4, '#ff8a7a');
    if (e.type === 'tailStrike') game.hud.message('¡Golpe de cola! Rota con más suavidad', 4, '#ffcc66');
  });
  game.on('frame', (dt) => {
    if (game.state === 'flying' && !game.paused) runner.update(dt);
    if (game.state === 'menu') game.camCtl.orbitYaw += dt * 0.05;
    audio.update(game, dt);
    touch.sync();
    autoResolution(dt);
    if (qs.has('fps')) $('dbg').textContent = `${game.fps.toFixed(0)} fps · escala ${game.quality.scale.toFixed(2)} · ${game.renderer.post.w}×${game.renderer.post.h}`;
  });
  game.on('camera', (m) => game.hud.message({ chase: 'Vista exterior', cockpit: 'Cabina', flyby: 'Sobrevuelo' }[m] || m, 1.6));
  game.on('engine', (on) => game.hud.message(on ? 'Arrancando el motor…' : 'Motor parado', 2.5));
  game.on('yoke', (on) => game.hud.message(on ? 'Yugo con el ratón activado (Y o Esc para salir)' : 'Yugo con el ratón desactivado', 3));
  game.on('stepDone', () => audio.click());
  game.on('action', (a) => {
    if (a === 'pause') { if (game.state === 'flying' && !game.paused) pause(); else if (shell.screen === 'pause') handlers.resume(); }
    else if (a === 'restart' && game.state === 'flying' && mission) handlers.restart();
    else if (a === 'help' && game.state === 'flying' && !game.paused) { pause(); shell.help(true); }
  });

  const pause = () => {
    if (game.state !== 'flying') return;
    game.paused = true;
    $('fly').classList.add('hidden'); touch.show(false);
    shell.pause(mission && !mission.free ? mission.title : 'Pausa');
  };
  handlers.resume = () => {
    shell.hide(); game.paused = false;
    $('fly').classList.remove('hidden'); touch.show(isTouch);
  };
  handlers.startMission = (m) => {
    if (!m) return;
    audio.init();
    clearTimeout(endTimer);
    mission = m;
    applyEnv(m.env);
    game.placeAircraft(m.start);
    game.ac.noDamage = !store.settings.damage;
    game.nav.target = m.nav ? AIRPORTS.find((a) => a.id === m.nav) : m.landing ? AIRPORTS.find((a) => a.id === m.landing.airport) : null;
    game.camCtl.mode = 'chase'; game.camCtl.resetView();
    game.hud.trail.length = 0; game.hud.showMap = false; game.hud.messages.length = 0;
    game.hud.subtitle = m.tips ? m.tips[0] : '';
    game.state = 'flying'; game.paused = false;
    runner.start(m);
    shell.hide();
    $('fly').classList.remove('hidden'); $('fly').classList.toggle('touch', isTouch);
    touch.show(isTouch);
    if (m.tips) m.tips.forEach((t, i) => setTimeout(() => { if (mission === m && game.state === 'flying') game.hud.subtitle = t; }, i * 14000));
    if (m.free && !m.start.air && !m.start.approach) game.hud.message(isTouch ? 'Suelta el freno de estacionamiento y sube los gases' : 'B: soltar freno · W: gases · H: ayuda', 7);
  };
  handlers.restart = () => { if (mission) handlers.startMission(mission.steps === null ? MISSIONS.find((x) => x.id === mission.id) || mission : mission); else toMenu(); };
  handlers.quit = () => toMenu();
  handlers.continueFree = () => {
    // seguir volando tras completar la misión
    mission = { ...FREE_FLIGHT, id: mission ? mission.id : 'libre', env: mission ? mission.env : FREE_FLIGHT.env, start: mission ? mission.start : FREE_FLIGHT.start };
    runner.start(mission);
    game.hud.subtitle = '';
    handlers.resume();
  };

  // botones en pantalla
  $('fly').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fly]');
    if (!b) return;
    audio.click();
    if (b.dataset.fly === 'pause') pause(); else game.handleAction(b.dataset.fly);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'flying' && !game.paused) pause(); });

  // ---------- resolución dinámica ----------
  let resT = 0, slow = 0, fast = 0;
  function autoResolution(dt) {
    if (!store.settings.autoRes || dt <= 0 || qs.has('paused')) return;
    resT += dt;
    if (dt > 1 / 38) slow += dt; else if (dt < 1 / 55) fast += dt;
    if (resT < 1.5) return;
    const sc = game.quality.scale;
    if (slow > resT * 0.6 && sc > 0.55) { game.quality.scale = Math.max(0.55, sc - 0.1); game.resize(); }
    else if (fast > resT * 0.9 && sc < game.baseScale) { game.quality.scale = Math.min(game.baseScale, sc + 0.05); game.resize(); }
    resT = 0; slow = 0; fast = 0;
  }

  // Si el navegador descarta el contexto gráfico (memoria, suspensión), avisar en vez de quedar en negro.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    game.frozen = true;
    $('fly').classList.add('hidden'); touch.show(false);
    shell.error('El navegador ha interrumpido los gráficos (suele pasar por falta de memoria). Recarga la página; si se repite, elige una calidad gráfica menor en Ajustes.');
  });

  handlers.applySettings();
  toMenu();
  game.frozen = qs.has('paused');
  game.start();

  // ---------- API de depuración / pruebas ----------
  const r = game.renderer;
  window.SIM = {
    game, gl: game.gl, renderer: r, env, cam: game.cam, ac: game.ac, camCtl: game.camCtl, KT, FT, shell, runner, store, handlers, MISSIONS, audio, touch,
    setCam(x, y, z, yaw, pitch, fov) { game.camCtl.mode = 'free'; game.camCtl.free = { pos: [x, y, z], yaw, pitch, fov: fov || 55 }; },
    frame(dt = 1 / 60) { game.step(dt); },
    async settle(maxFrames = 12) {
      r.instantExposure = true; r.post.syncMeter = true;
      let lastE = 0;
      const p = game.paused; game.paused = true;
      for (let i = 0; i < maxFrames; i++) { game.step(0); if (i > 1 && Math.abs(r.exposure / lastE - 1) < 0.01) break; lastE = r.exposure; }
      game.step(0); game.gl.finish();
      game.paused = p; r.post.syncMeter = false; r.instantExposure = false;
    },
    simulate(seconds, ctrl) {
      const dt = 1 / 120;
      for (let t = 0; t < seconds; t += dt) { if (ctrl) ctrl(game.ac, dt, t); game.ac.update(dt, game.world); for (const e of game.ac.events) runner.onEvent(e); game.ac.events.length = 0; runner.update(dt); }
    },
    fly(id) { handlers.startMission(id ? MISSIONS.find((m) => m.id === id) : shell.freeMission()); },
  };
  if (qs.get('fly')) window.SIM.fly(qs.get('fly') === 'libre' ? null : qs.get('fly'));
  window.__ready = true;
}

boot().catch((e) => {
  console.error(e);
  window.__error = e.message || String(e);
  const ui = $('ui');
  ui.className = 'solid';
  ui.innerHTML = `<div class="card mid"><h2>No se pudo iniciar</h2><p></p><p class="sub">Horizonte necesita un navegador actual con WebGL 2 y aceleración gráfica. Si el problema continúa, prueba otra calidad gráfica añadiendo <b>?q=low</b> a la dirección.</p></div>`;
  ui.querySelector('p').textContent = e.message || String(e);
});
