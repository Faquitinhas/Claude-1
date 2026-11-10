// Arranque (versión de desarrollo): inicializa el render y expone window.SIM para pruebas.
import { initGL } from './core/gl.js';
import { quat, DEG } from './core/math.js';
import { Renderer, QUALITY } from './render/renderer.js';
import { createCamera, updateCamera } from './render/camera.js';
import { Environment } from './game/env.js';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');
const statusEl = document.getElementById('status');

async function boot() {
  const gl = initGL(canvas);
  if (!gl) throw new Error('Tu navegador no soporta WebGL 2.');
  const q = { ...QUALITY[qs.get('q') || 'high'] };
  if (qs.get('N')) q.N = +qs.get('N');
  if (qs.get('M')) q.M = +qs.get('M');
  if (qs.get('scale')) q.scale = +qs.get('scale');
  q.clouds = { ...q.clouds };
  if (qs.get('cres')) q.clouds.res = +qs.get('cres');
  if (qs.get('csteps')) q.clouds.steps = +qs.get('csteps');
  const renderer = new Renderer(gl, q);
  const env = new Environment();
  if (qs.get('t')) env.timeOfDay = +qs.get('t');
  if (qs.get('haze')) env.haze = +qs.get('haze');
  if (qs.get('cov')) env.clouds.coverage = +qs.get('cov');
  env.update(0);
  const t0 = performance.now();
  await renderer.init([], (f) => { if (statusEl) statusEl.textContent = `Generando el mundo… ${Math.round(f * 100)}%`; });
  console.log(`init ${(performance.now() - t0).toFixed(0)} ms, maxH=${renderer.terrainData.maxHeight.toFixed(0)}`);
  if (statusEl) statusEl.style.display = 'none';

  const cam = createCamera();
  const view = { yaw: 0, pitch: 0 };
  const setCam = (x, y, z, yawDeg, pitchDeg, fovDeg) => {
    cam.pos = [x, y, z]; view.yaw = yawDeg; view.pitch = pitchDeg;
    if (fovDeg) cam.fovY = fovDeg * DEG;
  };
  if (qs.get('cam')) setCam(...qs.get('cam').split(',').map(Number));
  else setCam(-3000, 1500, 14000, 0, -8);

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    renderer.resize(w, h);
    cam.aspect = w / h;
  };
  resize();
  window.addEventListener('resize', resize);

  let last = performance.now();
  const frame = (dt = 1 / 60) => {
    env.update(dt);
    quat.fromHPR(cam.q, view.yaw * DEG, view.pitch * DEG, 0);
    renderer.clear = renderer.clearance(cam.pos);
    cam.near = Math.min(Math.max(renderer.clear * 0.2, 0.5), 40);
    updateCamera(cam);
    renderer.render(cam, env, dt, null);
  };
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (!window.SIM.paused) frame(dt);
    requestAnimationFrame(loop);
  };
  window.SIM = {
    gl, renderer, env, cam, view, setCam, frame, paused: qs.has('paused'),
    // Renderiza varios frames para estabilizar la exposición (pruebas).
    // Renderiza frames hasta que la exposición automática converge (para pruebas).
    async settle(maxFrames = 12) {
      renderer.instantExposure = true;
      renderer.post.syncMeter = true;
      let lastE = 0;
      for (let i = 0; i < maxFrames; i++) {
        frame(0);
        if (i > 1 && Math.abs(renderer.exposure / lastE - 1) < 0.01) break;
        lastE = renderer.exposure;
      }
      frame(0);
      gl.finish();
      renderer.post.syncMeter = false;
      renderer.instantExposure = false;
    },
  };
  requestAnimationFrame(loop);
  window.__ready = true;
}

boot().catch((e) => {
  console.error(e);
  window.__error = e.message || String(e);
  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Error: ' + (e.message || e); }
});
