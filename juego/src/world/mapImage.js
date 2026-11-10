// Genera una imagen cenital de la isla (relieve sombreado) para el mapa del juego.
import { GLSL_HEADER, FULLSCREEN_VS, Program, createTexture, createFBO, bindFBO, drawFullscreen } from '../core/gl.js';
import { GLSL_HEIGHT_CODEC } from './terrainGen.js';

const FS = `${GLSL_HEADER}
${GLSL_HEIGHT_CODEC}
uniform sampler2D uH, uNrm;
in vec2 vUV; out vec4 o;
void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);          // norte arriba
  float h = decodeH(textureLod(uH, uv, 2.0));
  vec4 nt = textureLod(uNrm, uv, 2.0);
  vec3 n; n.xz = nt.rg * 2.0 - 1.0; n.y = sqrt(max(0.0, 1.0 - dot(n.xz, n.xz)));
  float forest = nt.a, slope = 1.0 - n.y;
  vec3 sun = normalize(vec3(-0.55, 0.62, -0.55));
  float lam = max(dot(n, sun), 0.0);
  vec3 col;
  if (h < 0.0) col = mix(vec3(0.20, 0.52, 0.62), vec3(0.06, 0.17, 0.33), smoothstep(0.0, -70.0, h));
  else {
    col = mix(vec3(0.80, 0.74, 0.55), vec3(0.42, 0.55, 0.26), smoothstep(2.0, 12.0, h));
    col = mix(col, vec3(0.58, 0.55, 0.38), smoothstep(700.0, 1500.0, h));
    col = mix(col, vec3(0.55, 0.52, 0.49), smoothstep(0.25, 0.5, slope));
    col = mix(col, vec3(0.20, 0.36, 0.17), forest * 0.85);
    col = mix(col, vec3(0.97), smoothstep(1650.0, 1900.0, h) * (1.0 - smoothstep(0.45, 0.7, slope)));
    col *= 0.45 + 0.95 * lam;
    // curvas de nivel cada 250 m
    float f = abs(fract(h / 250.0) - 0.5);
    col *= 1.0 - 0.18 * smoothstep(0.47, 0.5, f);
  }
  o = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

export function makeMapImage(gl, terrainData, size = 768) {
  const tex = createTexture(gl, { width: size, height: size, format: 'rgba8', filter: 'nearest' });
  const fbo = createFBO(gl, [tex]);
  const prog = new Program(gl, FULLSCREEN_VS, FS, 'mapImage');
  bindFBO(gl, fbo);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  prog.use().set('uH', terrainData.heightTex).set('uNrm', terrainData.normalTex);
  drawFullscreen(gl);
  const px = new Uint8Array(size * size * 4);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.deleteFramebuffer(fbo.fbo); gl.deleteTexture(tex.tex); gl.deleteProgram(prog.p);
  bindFBO(gl, null);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  // readPixels devuelve la fila inferior primero: voltear
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0);
  return c;
}
