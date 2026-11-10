// Arranque de Horizonte.
import { Game, KT, FT } from './game/game.js';
import { DEG } from './core/math.js';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');
const statusEl = document.getElementById('status');
const dbgEl = document.getElementById('dbg');

async function boot() {
  const q = {}, cloudQ = {};
  if (qs.get('N')) q.N = +qs.get('N');
  if (qs.get('M')) q.M = +qs.get('M');
  if (qs.get('scale')) q.scale = +qs.get('scale');
  if (qs.get('cres')) cloudQ.res = +qs.get('cres');
  if (qs.get('csteps')) cloudQ.steps = +qs.get('csteps');
  const game = new Game(canvas, { quality: qs.get('q') || 'high', q, cloudQ, hudCanvas: document.getElementById('hud') });
  const env = game.env;
  if (qs.get('t')) env.timeOfDay = +qs.get('t');
  if (qs.get('haze')) env.haze = +qs.get('haze');
  if (qs.get('cov')) env.clouds.coverage = +qs.get('cov');
  env.update(0);
  const t0 = performance.now();
  await game.init((f) => { if (statusEl) statusEl.textContent = `Generando el mundo… ${Math.round(f * 100)}%`; });
  console.log(`init ${(performance.now() - t0).toFixed(0)} ms, maxH=${game.renderer.terrainData.maxHeight.toFixed(0)}`);
  if (statusEl) statusEl.style.display = 'none';

  game.placeAircraft({ airport: qs.get('ap') || 'HZPA', end: +(qs.get('end') || 0) });
  game.state = 'flying';
  game.frozen = qs.has('paused');
  if (dbgEl) game.on('frame', () => { dbgEl.textContent = qs.has('fps') ? `${game.fps.toFixed(0)} fps` : ''; });
  game.start();

  // API de depuración/pruebas
  const r = game.renderer;
  window.SIM = {
    game, gl: game.gl, renderer: r, env, cam: game.cam, ac: game.ac, camCtl: game.camCtl, KT, FT,
    setCam(x, y, z, yaw, pitch, fov) {
      game.camCtl.mode = 'free';
      game.camCtl.free = { pos: [x, y, z], yaw, pitch, fov: fov || 55 };
    },
    frame(dt = 1 / 60) { game.step(dt); },
    // Renderiza frames hasta que la exposición automática converge (para pruebas).
    async settle(maxFrames = 12) {
      r.instantExposure = true;
      r.post.syncMeter = true;
      let lastE = 0;
      const p = game.paused; game.paused = true;
      for (let i = 0; i < maxFrames; i++) {
        game.step(0);
        if (i > 1 && Math.abs(r.exposure / lastE - 1) < 0.01) break;
        lastE = r.exposure;
      }
      game.step(0);
      game.gl.finish();
      game.paused = p;
      r.post.syncMeter = false;
      r.instantExposure = false;
    },
    // Avanza la simulación sin renderizar (rápido).
    simulate(seconds, ctrl) {
      const dt = 1 / 120;
      for (let t = 0; t < seconds; t += dt) { if (ctrl) ctrl(game.ac, dt, t); game.ac.update(dt, game.world); }
      game.ac.events.length = 0;
    },
  };
  window.__ready = true;
}

boot().catch((e) => {
  console.error(e);
  window.__error = e.message || String(e);
  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Error: ' + (e.message || e); }
});
