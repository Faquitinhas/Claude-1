// Orquesta el frame: LUTs de atmósfera, sombras, escena HDR, cielo/océano, nubes y post-proceso.
import { bindFBO } from '../core/gl.js';
import { clamp } from '../core/math.js';
import { TerrainData } from '../world/terrainGen.js';
import { Terrain } from '../world/terrain.js';
import { createDetailTextures } from '../world/detailTex.js';
import { Atmosphere } from '../world/atmosphere.js';
import { Sky } from '../world/sky.js';
import { Ocean } from '../world/ocean.js';
import { PostFX } from './post.js';

export const QUALITY = {
  low: { N: 2048, M: 64, scale: 0.6, fxaa: true },
  medium: { N: 2048, M: 128, scale: 0.8, fxaa: true },
  high: { N: 4096, M: 128, scale: 1.0, fxaa: true },
  ultra: { N: 4096, M: 256, scale: 1.0, fxaa: true },
};

export class Renderer {
  constructor(gl, q) {
    this.gl = gl;
    this.q = q;
    this.exposure = 4;
    this.exposureReady = 0;
    this.instantExposure = false;
    this.stats = {};
  }

  async init(airports, onProgress = () => {}) {
    const gl = this.gl;
    this.terrainData = new TerrainData(gl, this.q.N);
    await this.terrainData.bake(airports, (f) => onProgress(f * 0.9));
    this.detail = createDetailTextures(gl, 512);
    this.terrain = new Terrain(gl, this.terrainData, this.detail, this.q.M);
    this.atmosphere = new Atmosphere(gl);
    this.ocean = new Ocean(gl);
    this.sky = new Sky(gl);
    this.post = new PostFX(gl);
    this.post.settings.fxaa = this.q.fxaa;
    onProgress(1);
  }

  resize(canvasW, canvasH) {
    this.outW = canvasW; this.outH = canvasH;
    const w = Math.max(16, Math.round(canvasW * this.q.scale)), h = Math.max(16, Math.round(canvasH * this.q.scale));
    this.post.resize(w, h);
  }

  // Distancia aproximada de la cámara al terreno más cercano (para LOD y plano cercano).
  clearance(pos) {
    const T = this.terrainData;
    let best = Math.max(pos[1] - Math.max(T.height(pos[0], pos[2]), 0), 0.5);
    for (let r = 150; r <= 1200; r *= 2) {
      for (let a = 0; a < 8; a++) {
        const x = pos[0] + Math.cos(a * 0.785) * r, z = pos[2] + Math.sin(a * 0.785) * r;
        const dh = pos[1] - Math.max(T.heightNearest(x, z), 0);
        const d = dh > 0 ? Math.hypot(r, dh) : r * 0.5;
        if (d < best) best = d;
      }
    }
    return best;
  }

  _updateExposure(env, dt) {
    const m = this.post.pollMeter();
    if (m) {
      // luminancia media de la escena sin exposición (unidades: iluminancia solar = 1)
      const lum = Math.pow(2, m.logLum) / m.exposure;
      const key = 0.035 + 0.115 * clamp((Math.log10(lum) + 5.2) / 3.4, 0, 1);
      this.targetExposure = clamp(key / Math.max(lum, 1e-9), 0.3, 6e6);
      this.exposureReady++;
    }
    if (this.targetExposure) {
      if (this.instantExposure || this.exposureReady < 3) this.exposure = this.targetExposure;
      else {
        const up = this.targetExposure > this.exposure;
        const rate = up ? 0.9 : 1.8; // EV por segundo aprox.
        const le = Math.log2(this.exposure), lt = Math.log2(this.targetExposure);
        const step = clamp(lt - le, -rate * dt * 2, rate * dt * 2);
        this.exposure = Math.pow(2, le + step);
      }
    }
  }

  render(cam, env, dt, drawScene) {
    const gl = this.gl, post = this.post;
    this._updateExposure(env, dt);
    const ex = this.exposure;
    const sunE = env.sunE0.map((v) => v * ex), moonE = env.moonE0.map((v) => v * ex);
    this.atmosphere.params.mie = env.haze;
    if (this._haze !== env.haze) { this.atmosphere.dirty = true; this._haze = env.haze; }
    this.terrain.updateShadow(env.primaryLight);
    this.atmosphere.update(cam.pos[1], env.sunDir, env.moonDir, sunE, moonE, cam.rays);

    const vp = [post.w, post.h];
    bindFBO(gl, post.sceneFBO);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    this.terrain.render(cam, this.atmosphere, vp, this.clear);
    if (drawScene) drawScene(vp, ex);
    gl.disable(gl.CULL_FACE);
    this.sky.render(cam, this.atmosphere, this.terrain, env, vp, ex, this.ocean);
    const night = clamp((Math.log10(ex) - 2.2) / 2.5, 0, 1) * 0.85;
    post.render(this.outW, this.outH, ex, env.time, night);
  }
}
