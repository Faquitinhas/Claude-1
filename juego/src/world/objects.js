// Edificios de los aeródromos (terminal, torre, hangares, depósitos) y mangas de viento.
// Geometría procedural sencilla alineada con la pista; proyectan sombra analítica en el
// shader del terreno (cajas) y sus ventanas se iluminan de noche.
import { GLSL_HEADER, Program } from '../core/gl.js';
import { GLSL_ATMO_SCENE, EARTH_RADIUS } from './atmosphere.js';
import { GLSL_TERRAIN_SAMPLING } from './terrain.js';
import { GLSL_CLOUD_SHADOW } from './clouds.js';
import { AIRPORTS, runwayPoint, airportBuildings } from './airports.js';

class MB {
  constructor() { this.d = []; this.n = 0; }
  quad(a, b, c, d, col, mat) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    // uv local para ventanas: (0..1) en el quad
    const uv = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    [a, b, c, a, c, d].forEach((p, i) => { this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], mat, uv[i][0], uv[i][1]); this.n++; });
  }
}

function buildMesh(terrain) {
  const m = new MB();
  for (const a of AIRPORTS) {
    const P = (al, ac, y) => { const [x, z] = runwayPoint(a, al, ac); return [x, y, z]; };
    for (const b of airportBuildings(a)) {
      const [cx, cz] = runwayPoint(a, b.al, b.ac);
      const g = Math.max(terrain.height(cx, cz), a.elev) ;
      const y0 = g - 2.5, y1 = g + b.h;
      const s = Math.sign(b.ac);
      // cara que mira a la plataforma: across menor en valor absoluto
      const c = (da, dc, y) => P(b.al + da * b.ha, b.ac + dc * b.hc, y);
      const wall = (da0, dc0, da1, dc1, col, mat, yA = y0, yB = y1) => m.quad(c(da0, dc0, yA), c(da1, dc1, yA), c(da1, dc1, yB), c(da0, dc0, yB), col, mat);
      const walls = (col, mat, front = mat, yB = y1) => {
        // orden antihorario visto desde fuera (según el signo del lado)
        const f = -s;   // lado que mira a pista
        if (s > 0) { wall(-1, f, 1, f, col, front, y0, yB); wall(1, f, 1, -f, col, mat, y0, yB); wall(1, -f, -1, -f, col, mat, y0, yB); wall(-1, -f, -1, f, col, mat, y0, yB); }
        else { wall(1, f, -1, f, col, front, y0, yB); wall(-1, f, -1, -f, col, mat, y0, yB); wall(-1, -f, 1, -f, col, mat, y0, yB); wall(1, -f, 1, f, col, mat, y0, yB); }
      };
      const roofFlat = (y, col, k = 1) => { const q = [c(-k, -1 * k, y), c(k, -1 * k, y), c(k, k, y), c(-k, k, y)]; if (s > 0) m.quad(q[0], q[3], q[2], q[1], col, 2); else m.quad(q[0], q[3], q[2], q[1], col, 2); };
      if (b.kind === 'terminal') {
        walls([0.50, 0.48, 0.44], 0, 1);
        roofFlat(y1, [0.16, 0.16, 0.17]);
      } else if (b.kind === 'tower') {
        walls([0.55, 0.54, 0.52], 0, 0, y1);
        roofFlat(y1, [0.2, 0.2, 0.2]);
        // cabina acristalada, más ancha que el fuste
        const k = 1.45, yc0 = y1, yc1 = y1 + 3.6;
        const cc = (da, dc, y) => P(b.al + da * b.ha * k, b.ac + dc * b.hc * k, y);
        const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (let i = 0; i < 4; i++) {
          const p0 = ring[i], p1 = ring[(i + 1) % 4];
          const q = [cc(p0[0], p0[1], yc0), cc(p1[0], p1[1], yc0), cc(p1[0], p1[1], yc1), cc(p0[0], p0[1], yc1)];
          // probar orientación: la normal debe apuntar hacia fuera del centro
          m.quad(q[1], q[0], q[3], q[2], [0.05, 0.08, 0.10], 3);
          m.quad(q[0], q[1], q[2], q[3], [0.05, 0.08, 0.10], 3);
        }
        const top = [cc(-1.1, -1.1, yc1), cc(1.1, -1.1, yc1), cc(1.1, 1.1, yc1), cc(-1.1, 1.1, yc1)];
        m.quad(top[0], top[3], top[2], top[1], [0.6, 0.6, 0.6], 2); m.quad(top[0], top[1], top[2], top[3], [0.3, 0.3, 0.3], 2);
        const bot = [cc(-1, -1, yc0), cc(1, -1, yc0), cc(1, 1, yc0), cc(-1, 1, yc0)];
        m.quad(bot[0], bot[1], bot[2], bot[3], [0.3, 0.3, 0.3], 2);
      } else if (b.kind === 'hangar') {
        const col = [0.42, 0.44, 0.46];
        walls(col, 4, 5);
        // cubierta a dos aguas (cumbrera a lo largo de 'across')
        const yr = y1 + b.ha * 0.28;
        const e0 = c(-1, -1, y1), e1 = c(-1, 1, y1), e2 = c(1, 1, y1), e3 = c(1, -1, y1), r0 = c(0, -1, yr), r1 = c(0, 1, yr);
        const rc = [0.30, 0.33, 0.36];
        m.quad(e0, r0, r1, e1, rc, 4); m.quad(e1, r1, r0, e0, rc, 4);
        m.quad(r0, e3, e2, r1, rc, 4); m.quad(r1, e2, e3, r0, rc, 4);
        // testeros triangulares
        m.quad(e0, e3, r0, r0, col, 4); m.quad(e3, e0, r0, r0, col, 4);
        m.quad(e2, e1, r1, r1, col, 4); m.quad(e1, e2, r1, r1, col, 4);
      } else if (b.kind === 'hut') {
        walls([0.62, 0.58, 0.50], 0, 1);
        roofFlat(y1, [0.35, 0.16, 0.12], 1.12);
      } else if (b.kind === 'tank' || b.kind === 'pole') {
        // cilindro
        const N = b.kind === 'pole' ? 6 : 14, col = b.kind === 'pole' ? [0.5, 0.5, 0.5] : [0.72, 0.72, 0.70];
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * 6.2832, a1 = ((i + 1) / N) * 6.2832;
          const p0 = [Math.cos(a0), Math.sin(a0)], p1 = [Math.cos(a1), Math.sin(a1)];
          const q = [c(p0[0], p0[1], y0), c(p1[0], p1[1], y0), c(p1[0], p1[1], y1), c(p0[0], p0[1], y1)];
          m.quad(q[0], q[1], q[2], q[3], col, 2); m.quad(q[1], q[0], q[3], q[2], col, 2);
          const t = [c(0, 0, y1), c(p0[0], p0[1], y1), c(p1[0], p1[1], y1), c(0, 0, y1)];
          m.quad(t[0], t[1], t[2], t[3], col, 2); m.quad(t[0], t[2], t[1], t[3], col, 2);
        }
      }
    }
  }
  return m;
}

// Manga de viento: mástil + cono a rayas (en espacio local; se orienta por uniform).
function buildSock() {
  const m = new MB();
  const N = 10, H = 6.2;
  // mástil
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * 6.2832, a1 = ((i + 1) / 6) * 6.2832, r = 0.06;
    m.quad([Math.cos(a0) * r, 0, Math.sin(a0) * r], [Math.cos(a1) * r, 0, Math.sin(a1) * r], [Math.cos(a1) * r, H, Math.sin(a1) * r], [Math.cos(a0) * r, H, Math.sin(a0) * r], [0.6, 0.6, 0.6], 2);
    m.quad([Math.cos(a1) * r, 0, Math.sin(a1) * r], [Math.cos(a0) * r, 0, Math.sin(a0) * r], [Math.cos(a0) * r, H, Math.sin(a0) * r], [Math.cos(a1) * r, H, Math.sin(a1) * r], [0.6, 0.6, 0.6], 2);
  }
  // cono: 5 tramos a lo largo de +X local desde el origen (se coloca en lo alto del mástil por el shader, mat 6)
  const SEG = 5, LEN = 3.6;
  for (let s = 0; s < SEG; s++) {
    const x0 = (s / SEG) * LEN, x1 = ((s + 1) / SEG) * LEN;
    const r0 = 0.46 - 0.24 * (s / SEG), r1 = 0.46 - 0.24 * ((s + 1) / SEG);
    const col = s % 2 === 0 ? [0.85, 0.22, 0.03] : [0.85, 0.85, 0.82];
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * 6.2832, a1 = ((i + 1) / N) * 6.2832;
      const q = [[x0, Math.cos(a0) * r0, Math.sin(a0) * r0], [x1, Math.cos(a0) * r1, Math.sin(a0) * r1], [x1, Math.cos(a1) * r1, Math.sin(a1) * r1], [x0, Math.cos(a1) * r0, Math.sin(a1) * r0]];
      m.quad(q[0], q[1], q[2], q[3], col, 6); m.quad(q[1], q[0], q[3], q[2], col, 6);
    }
  }
  return m;
}

const VS = `${GLSL_HEADER}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec3 aCol;
layout(location = 3) in vec3 aMat;   // material, u, v
uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec4 uSock;      // xyz: base de la manga (mundo), w: activo
uniform vec4 uSockW;     // xz: hacia dónde sopla, z: elevación del cono (rad), w: tiempo
out vec3 vRel; out vec3 vN; out vec3 vCol; out vec3 vMat; out vec3 vWorld;
void main() {
  vec3 p = aPos, n = aNrm;
  if (uSock.w > 0.5) {
    if (aMat.x > 5.5) {
      // cono: eje +X local -> dirección del viento, con caída según la fuerza y un flameo suave
      float fl = sin(uSockW.w * 6.0 + p.x * 2.2) * 0.07 * p.x;
      float ce = cos(uSockW.z), se = sin(uSockW.z);
      vec3 ax = vec3(uSockW.x * ce, -se, uSockW.y * ce);
      vec3 up = vec3(uSockW.x * se, ce, uSockW.y * se);
      vec3 sd = vec3(-uSockW.y, 0.0, uSockW.x);
      vec3 q = ax * p.x + up * (p.y + fl * 0.3) + sd * (p.z + fl);
      n = ax * n.x + up * n.y + sd * n.z;
      p = q + vec3(0.0, 6.2, 0.0);
    }
    p += uSock.xyz;
  }
  vec3 rel = p - uCamPos;
  rel.y -= dot(rel.xz, rel.xz) / (2.0 * ${EARTH_RADIUS.toFixed(1)});
  vRel = rel; vN = n; vCol = aCol; vMat = aMat; vWorld = p;
  gl_Position = uViewProj * vec4(rel, 1.0);
}`;

const FS = `${GLSL_HEADER}
${GLSL_ATMO_SCENE}
${GLSL_TERRAIN_SAMPLING}
${GLSL_CLOUD_SHADOW}
uniform vec4 uParams;   // x: exposición, y: noche (0..1)
in vec3 vRel; in vec3 vN; in vec3 vCol; in vec3 vMat; in vec3 vWorld;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 N = normalize(vN);
  int mat = int(vMat.x + 0.5);
  vec3 alb = vCol;
  vec3 emis = vec3(0.0);
  float spec = 0.0;
  vec2 uv = vMat.yz;
  if (mat == 1) {
    // fachada con banda de ventanas
    float win = step(0.42, uv.y) * step(uv.y, 0.78) * step(0.12, fract(uv.x * 16.0)) ;
    alb = mix(alb, vec3(0.03, 0.045, 0.06), win);
    float lit = step(0.35, hash(floor(vec2(uv.x * 16.0, 3.0))));
    emis = vec3(1.0, 0.78, 0.45) * win * lit * uParams.y * 0.9;
    spec = win;
  } else if (mat == 3) {
    spec = 1.0;
    emis = vec3(0.6, 0.8, 1.0) * 0.12 * uParams.y;
  } else if (mat == 4) {
    // chapa ondulada
    alb *= 0.88 + 0.12 * sin(uv.x * 120.0);
  } else if (mat == 5) {
    // frente de hangar con portón
    float door = step(0.1, uv.x) * step(uv.x, 0.9) * step(uv.y, 0.82);
    alb = mix(alb, vec3(0.22, 0.24, 0.27) * (0.9 + 0.1 * step(0.5, fract(uv.x * 5.0))), door);
  }
  vec3 sunT = lightTransmittance(vWorld.y, uSunDir.y);
  float sh = terrainShadow(vWorld.xz) * cloudShadow(vWorld);
  vec3 E = uSunE * sunT * max(dot(N, uSunDir), 0.0) * sh + uMoonE * lightTransmittance(vWorld.y, uMoonDir.y) * max(dot(N, uMoonDir), 0.0);
  vec3 col = alb / PI * (E + skyIrradiance(N));
  if (spec > 0.0) {
    vec3 V = normalize(-vRel), R = reflect(-V, N);
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col += skyRadianceSoft(normalize(vec3(R.x, abs(R.y) + 0.03, R.z))) * F * spec;
  }
  col += emis;
  col = applyAP(col, vRel);
  o = vec4(col, 1.0);
}`;

function upload(gl, m) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.d), gl.STATIC_DRAW);
  for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 48, i * 12); }
  gl.bindVertexArray(null);
  return { vao, count: m.n };
}

export class AirportObjects {
  constructor(gl, terrainData) {
    this.gl = gl;
    this.T = terrainData;
    this.mesh = upload(gl, buildMesh(terrainData));
    this.sock = upload(gl, buildSock());
    this.prog = new Program(gl, VS, FS, 'objects');
    // posición de las mangas: junto a la pista, en el lado opuesto a la plataforma
    this.socks = AIRPORTS.map((a) => {
      const [x, z] = runwayPoint(a, -a.length * 0.18, -Math.sign(a.apron.across) * (a.width / 2 + 28));
      return [x, Math.max(terrainData.height(x, z), 0), z];
    });
  }

  render(ctx) {
    const { cam, env, atmosphere, terrain, clouds, viewport, exposure } = ctx;
    const gl = this.gl, p = this.prog.use();
    atmosphere.bind(p, viewport);
    terrain.bindSampling(p);
    clouds.bindShadow(p, env.primaryLight);
    const night = Math.min(Math.max((0.06 - env.sunDir[1]) / 0.16, 0), 1);
    // las ventanas emiten con brillo aparente estable (independiente de la exposición)
    p.set('uViewProj', cam.viewProj).set('uCamPos', cam.pos[0], cam.pos[1], cam.pos[2]).set('uParams', exposure, night, 0, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
    p.set('uSock', 0, 0, 0, 0);
    gl.bindVertexArray(this.mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.mesh.count);
    // mangas de viento
    const to = ((env.wind.dir + 180) * Math.PI) / 180;
    const sp = env.wind.speed;
    const elev = (1 - Math.min(sp / 7.7, 1)) * 1.35 + 0.06;      // cuelga en calma, horizontal con 15 kt
    p.set('uSockW', Math.sin(to), -Math.cos(to), elev, env.time);
    gl.bindVertexArray(this.sock.vao);
    for (const s of this.socks) {
      if (Math.hypot(s[0] - cam.pos[0], s[2] - cam.pos[2]) > 6000) continue;
      p.set('uSock', s[0], s[1], s[2], 1);
      gl.drawArrays(gl.TRIANGLES, 0, this.sock.count);
    }
    gl.bindVertexArray(null);
  }
}
