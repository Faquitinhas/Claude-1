// Árboles instanciados sin estado: no hay lista de árboles. Cada instancia ocupa una celda de
// una rejilla alrededor de la cámara y el vertex shader decide, a partir de la celda del
// mundo (hash) y de la máscara de bosque horneada, si hay árbol, dónde, de qué especie y
// tamaño. Tres anillos de detalle; los lejanos representan grupos de árboles.
import { GLSL_HEADER, Program } from '../core/gl.js';
import { GLSL_HASH } from './glslNoise.js';
import { GLSL_ATMO_SCENE, EARTH_RADIUS } from './atmosphere.js';
import { GLSL_TERRAIN_SAMPLING } from './terrain.js';
import { GLSL_CLOUD_SHADOW } from './clouds.js';

const VS = `${GLSL_HEADER}
layout(location = 0) in vec3 aPos;   // x: ángulo (0..1), y: t a lo largo del tronco (0..1), z: 1 = punta
${GLSL_HASH}
${GLSL_TERRAIN_SAMPLING}
uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec4 uGrid;     // x: tamaño de celda, y: G, z: escala de tamaño, w: radio interior (hueco del anillo más fino)
uniform vec2 uBase;     // celda base (entera) = floor(cam / celda)
uniform vec2 uBaseFrac; // cam - base*celda (precisión)
out vec3 vRel;
out vec3 vN;
out vec4 vCol;          // rgb albedo, a: oclusión
out vec3 vWorld;
void main() {
  float G = uGrid.y, cell = uGrid.x;
  float id = float(gl_InstanceID);
  vec2 gi = vec2(mod(id, G), floor(id / G)) - G * 0.5;
  vec2 wc = uBase + gi;                               // celda del mundo
  vec3 h = hash33(vec3(wc, 7.0 + cell));
  vec3 h2 = hash33(vec3(wc, 31.0 + cell));
  vec2 inCell = (0.5 + (h.xy - 0.5) * 0.92) * cell;
  vec2 relXZ = gi * cell + inCell - uBaseFrac;        // relativo a cámara
  vec2 w = uCamPos.xz + relXZ;
  float dist = length(relXZ);
  float R = G * 0.5 * cell;
  // desvanecer en el borde exterior del anillo y en el hueco del anillo más fino
  float fade = (1.0 - smoothstep(R * 0.80, R * 0.97, dist)) * smoothstep(uGrid.w * 0.80, uGrid.w * 0.98, dist);
  vec4 nt = textureLod(uNormalTex, terrUV(w), 0.0);
  float forest = nt.a;
  float exists = step(0.22 + 0.6 * h.z, forest) * step(0.001, fade);
  float gh = terrHeightLod(w, 0.0);
  // especie: coníferas con la altitud; tamaño menor cerca del límite del bosque
  float conifer = step(h2.x, smoothstep(150.0, 850.0, gh + (h2.y - 0.5) * 400.0));
  float hgt = mix(9.0, 21.0, h2.z) * (1.0 - 0.45 * smoothstep(900.0, 1450.0, gh)) * uGrid.z;
  float wid = hgt * mix(0.34, 0.24, conifer) * mix(1.0, 1.25, h.x);
  float s = exists * fade;
  float t = aPos.y, ang = aPos.x * 6.2831853 + h.y * 6.28;
  // perfil de radio (0..1) según la especie
  float rC = (1.0 - t) * (0.72 + 0.28 * abs(fract(t * 3.2) - 0.5) * 2.0) * smoothstep(0.0, 0.10, t) + 0.07 * (1.0 - smoothstep(0.0, 0.12, t));
  float tb = clamp((t - 0.24) / 0.76, 0.0, 1.0);
  float rB = sqrt(max(tb * (1.0 - tb), 0.0)) * 2.0 * smoothstep(0.2, 0.3, t) + 0.09 * (1.0 - smoothstep(0.2, 0.3, t));
  // lóbulos irregulares para que la copa no sea un sólido perfecto
  float lob = 1.0 + (1.0 - conifer) * 0.16 * sin(ang * 3.0 + h.x * 20.0 + t * 5.0) + 0.07 * sin(ang * 5.0 + h.y * 30.0);
  float r = mix(rB, rC, conifer) * lob * (1.0 - aPos.z);
  vec3 lp = vec3(cos(ang) * r * wid, t * hgt, sin(ang) * r * wid) * s;
  // normal aproximada del sólido de revolución
  float slopeN = mix(0.25 + 1.2 * (tb - 0.5), 0.45, conifer);
  vec3 n = normalize(vec3(cos(ang), slopeN, sin(ang)));
  if (aPos.z > 0.5) n = vec3(0.0, 1.0, 0.0);
  vec3 rel = vec3(relXZ.x + lp.x, gh - 0.4 - uCamPos.y + lp.y, relXZ.y + lp.z);
  rel.y -= dot(rel.xz, rel.xz) / (2.0 * ${EARTH_RADIUS.toFixed(1)});
  vRel = rel; vN = n;
  vWorld = vec3(w.x + lp.x, gh + lp.y, w.y + lp.z);
  vec3 albC = mix(vec3(0.020, 0.050, 0.020), vec3(0.036, 0.072, 0.026), h.x);
  vec3 albB = mix(vec3(0.036, 0.082, 0.020), vec3(0.085, 0.118, 0.030), h.x);
  vCol = vec4(mix(albB, albC, conifer) * (0.85 + 0.3 * h2.y), 0.35 + 0.65 * smoothstep(0.05, 0.9, t));
  gl_Position = s > 0.0 ? uViewProj * vec4(rel, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FS = `${GLSL_HEADER}
${GLSL_ATMO_SCENE}
${GLSL_TERRAIN_SAMPLING}
${GLSL_CLOUD_SHADOW}
uniform sampler2D uNoiseTex;
in vec3 vRel;
in vec3 vN;
in vec4 vCol;
in vec3 vWorld;
out vec4 o;
void main() {
  // Moteado del follaje: masas de hojas claras y huecos en sombra.
  vec2 uv = vWorld.xz * 0.19 + vWorld.y * vec2(0.13, 0.07);
  vec4 nz = texture(uNoiseTex, uv);
  vec4 nz2 = texture(uNoiseTex, uv * 0.23 + 0.37);
  float leaf = nz.g * 0.6 + nz2.b * 0.5;
  vec3 N = normalize(vN + (vec3(nz.r, nz2.r, nz.b) - 0.5) * 1.1);
  float sh = terrainShadow(vWorld.xz) * cloudShadow(vWorld);
  vec3 sunT = lightTransmittance(vWorld.y, uSunDir.y);
  // difuso envolvente (el follaje deja pasar luz) + algo de transmisión a contraluz
  float nl = dot(N, uSunDir);
  float wrap = clamp((nl + 0.35) / 1.35, 0.0, 1.0);
  float back = pow(clamp(dot(normalize(vRel), uSunDir), 0.0, 1.0), 4.0) * 0.25 * clamp(-nl + 0.3, 0.0, 1.0);
  vec3 E = uSunE * sunT * (wrap + back) * sh * (0.55 + 0.45 * vCol.a)
         + uMoonE * lightTransmittance(vWorld.y, uMoonDir.y) * clamp(dot(N, uMoonDir) * 0.6 + 0.4, 0.0, 1.0);
  float pocket = smoothstep(0.25, 0.6, leaf);
  vec3 alb = vCol.rgb * (0.45 + 1.15 * leaf);
  alb = mix(alb, alb * vec3(1.35, 1.2, 0.6), smoothstep(0.55, 0.8, nz2.g) * 0.5);   // brotes más claros
  vec3 col = alb / PI * (E * (0.45 + 0.55 * pocket) + skyIrradiance(N) * vCol.a * (0.6 + 0.4 * pocket));
  col = applyAP(col, vRel);
  o = vec4(col, 1.0);
}`;

// Malla de revolución: 'sides' lados y 'rings' anillos; el último anillo es la punta.
function lathe(sides, rings) {
  const v = [];
  const ts = [];
  for (let i = 0; i < rings; i++) ts.push(Math.pow(i / (rings - 1), 0.9));
  const P = (i, j) => [j / sides, ts[i], i === rings - 1 ? 1 : 0];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j + 1), d = P(i + 1, j);
      v.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  return new Float32Array(v);
}

export class Trees {
  constructor(gl, q = {}) {
    this.gl = gl;
    this.enabled = q.enabled !== false;
    // anillos: [celda (m), G, lados, anillos, escala de tamaño]
    const rings = q.rings || [[7, 96, 6, 6, 1.0], [14, 128, 5, 4, 1.3], [30, 144, 4, 3, 1.9]];
    this.rings = rings.map(([cell, G, sides, nr, scale]) => {
      const data = lathe(sides, nr);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      return { cell, G, scale, vao, count: data.length / 3 };
    });
    this.prog = new Program(gl, VS, FS, 'trees');
    this.maxAlt = 2600; // por encima de esta altura sobre el terreno no se dibujan
  }

  render(ctx, clearance) {
    if (!this.enabled || clearance > this.maxAlt) return;
    const { cam, env, atmosphere, terrain, clouds, viewport } = ctx;
    const gl = this.gl, p = this.prog.use();
    atmosphere.bind(p, viewport);
    terrain.bindSampling(p);
    clouds.bindShadow(p, env.primaryLight);
    p.set('uViewProj', cam.viewProj).set('uCamPos', cam.pos[0], cam.pos[1], cam.pos[2]);
    p.set('uNoiseTex', terrain.detail.noise);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    let inner = 0;
    for (const r of this.rings) {
      const R = r.G * 0.5 * r.cell;
      // los anillos finos solo se dibujan si la cámara está lo bastante cerca del suelo
      if (clearance < R * 1.6) {
        const bx = Math.floor(cam.pos[0] / r.cell), bz = Math.floor(cam.pos[2] / r.cell);
        p.set('uGrid', r.cell, r.G, r.scale, inner);
        p.set('uBase', bx, bz).set('uBaseFrac', cam.pos[0] - bx * r.cell, cam.pos[2] - bz * r.cell);
        gl.bindVertexArray(r.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, r.count, r.G * r.G);
        inner = R * 0.92;
      }
    }
    gl.bindVertexArray(null);
  }
}
