// Océano analítico: el rayo de vista se interseca con la esfera del nivel del mar y la
// superficie se sombrea con una suma de olas direccionales. Las olas menores que el píxel no
// se evalúan: su pendiente pasa a la rugosidad de la BRDF (transición geometría -> BRDF,
// Bruneton 2010), lo que da el brillo solar correcto a cualquier distancia sin aliasing.
import { rng } from '../core/math.js';

export const NUM_WAVES = 22;

// Nivel del mar animado en la orilla (resaca): compartido entre terreno y océano.
export const GLSL_SEA_LEVEL = /* glsl */`
uniform vec4 uSea; // x: tiempo, y: velocidad del viento (m/s), zw: dirección hacia la que sopla
float seaLevelAt(vec2 p) {
  float ph = dot(p, vec2(0.013, 0.009)) + sin(dot(p, vec2(0.0031, -0.0043))) * 2.0;
  return 0.10 * sin(uSea.x * 0.55 + ph) * (0.4 + 0.06 * uSea.y);
}
`;

// Sombra de nubes sobre un punto del mundo (se sustituye cuando el módulo de nubes está activo).
export const GLSL_CLOUD_SHADOW_STUB = /* glsl */`
float cloudShadow(vec3 wp) { return 1.0; }
`;

export const GLSL_OCEAN = /* glsl */`
uniform sampler2D uNoiseTex;
uniform vec4 uWaves[${NUM_WAVES}];   // kx, kz, omega, amplitud
uniform float uWavePhase[${NUM_WAVES}];

vec3 oceanColor(vec3 dir, float t) {
  const float R = 6360000.0;
  float camH = max(uCamPos.y, 1.5);
  vec3 rel = dir * t;
  vec2 P = uCamPos.xz + rel.xz;
  // Normal geométrica de la esfera en el punto de impacto.
  vec3 Ng = normalize(vec3(rel.x, rel.y + R + camH, rel.z));
  float cosV = max(dot(-dir, Ng), 0.0015);
  // Huella del píxel sobre el agua (m): a lo largo y a través de la dirección de vista.
  float fPerp = t * uPixelAngle;
  float fPar = fPerp / cosV;
  vec2 vh = normalize(dir.xz + 1e-6);
  vec2 sh = vec2(-vh.y, vh.x);

  // Profundidad del fondo.
  float lodH = clamp(log2(max(fPerp, 1.0) / uTerr.y), 0.0, 8.0);
  float hT = terrHeightLod(P, lodH);
  float level = seaLevelAt(P);
  float depth = max(level - hT, 0.0);

  // ---- olas ----
  vec4 nz = texture(uNoiseTex, P / 911.0);
  vec2 Pw = P + (nz.rg - 0.5) * 34.0;                 // deformación de dominio: rompe la regularidad
  float shoal = smoothstep(0.0, 5.0, depth);          // las olas se amortiguan en aguas someras
  vec2 slope = vec2(0.0);
  float varUn = 0.0;                                  // varianza de pendiente no resuelta
  // Envolventes lentas: las olas viajan en grupos, no como senos infinitos.
  vec4 e1 = texture(uNoiseTex, (P - uSea.zw * uSea.x * 2.0) / 730.0);
  vec4 e2 = texture(uNoiseTex, (P + uSea.wz * uSea.x * 1.3) / 173.0);
  for (int i = 0; i < ${NUM_WAVES}; i++) {
    vec4 w = uWaves[i];
    float k = length(w.xy);
    float lambda = 6.2831853 / k;
    vec2 d = w.xy / k;
    float foot = abs(dot(d, vh)) * fPar + abs(dot(d, sh)) * fPerp;
    float vis = smoothstep(1.6, 4.0, lambda / max(foot, 1e-4));
    int ei = i - (i / 4) * 4;
    float env = (i / 4) - ((i / 4) / 2) * 2 == 0 ? e1[ei] : e2[ei];
    float ak = w.w * k * (0.35 + 1.3 * env);
    varUn += (1.0 - vis * vis) * ak * ak * 0.5;
    if (vis > 0.0) {
      float ph = dot(w.xy, Pw) - w.z * uSea.x + uWavePhase[i];
      // Perfil con cresta algo afilada (segundo armónico).
      float c = cos(ph) + 0.35 * cos(2.0 * ph);
      slope += d * (ak * c * vis);
    }
  }
  slope *= shoal;
  varUn = varUn * shoal * shoal + 0.0015 + 0.0020 * uSea.y;   // + rizado capilar (Cox-Munk)
  float sigma = sqrt(varUn);

  // Normal perturbada en el marco local de la esfera (aprox. Y arriba).
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y) + (Ng - vec3(0.0, 1.0, 0.0)));
  vec3 V = -dir;
  float nv = max(dot(N, V), 0.02);

  // ---- luz incidente ----
  vec3 wp = vec3(P.x, 0.0, P.y);
  float sunVis = terrainShadow(P) * cloudShadow(wp);
  vec3 sunT = lightTransmittance(0.0, uSunDir.y);
  vec3 Esun = uSunE * sunT * sunVis;
  vec3 Emoon = uMoonE * lightTransmittance(0.0, uMoonDir.y);
  vec3 Esky = skyIrradiance(vec3(0.0, 1.0, 0.0)) * mix(0.55, 1.0, cloudShadow(wp));
  vec3 Ed = Esun * max(uSunDir.y, 0.0) + Emoon * max(uMoonDir.y, 0.0) + Esky;

  // ---- reflexión ----
  // Fresnel medio sobre la distribución de pendientes (ajuste de Bruneton).
  float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0 * exp(-2.69 * sigma)) / (1.0 + 22.7 * pow(sigma, 1.5));
  vec3 Rv = reflect(dir, N);
  // La rugosidad eleva la dirección media reflejada (se ve cielo más alto cerca del horizonte).
  Rv.y = max(Rv.y, 0.0) + sigma * 0.55 + 0.01;
  Rv = normalize(Rv);
  vec3 Lsky = skyRadianceSoft(Rv);
  // Brillo especular del Sol y la Luna (distribución de pendientes gaussiana).
  vec3 spec = vec3(0.0);
  {
    vec3 H = normalize(uSunDir + V);
    float hn = max(dot(H, N), 1e-3);
    vec2 zeta = vec2(dot(H, vec3(1.0, 0.0, 0.0)), dot(H, vec3(0.0, 0.0, 1.0))) / max(H.y, 1e-3) + slope;
    float p = exp(-0.5 * dot(zeta, zeta) / varUn) / (6.2831853 * varUn);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
    float nl = max(dot(N, uSunDir), 0.0);
    spec += Esun * (F * p / (4.0 * nv * pow(hn, 4.0))) * step(0.0, uSunDir.y) * smoothstep(0.0, 0.03, nl);
    H = normalize(uMoonDir + V);
    hn = max(dot(H, N), 1e-3);
    zeta = vec2(H.x, H.z) / max(H.y, 1e-3) + slope;
    p = exp(-0.5 * dot(zeta, zeta) / varUn) / (6.2831853 * varUn);
    F = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
    spec += Emoon * (F * p / (4.0 * nv * pow(hn, 4.0))) * step(0.0, uMoonDir.y);
  }
  spec = min(spec, vec3(4000.0));

  // ---- cuerpo de agua ----
  // Reflectancia difusa del agua profunda (más verdosa cerca de la costa).
  float coastal = 1.0 - smoothstep(4.0, 60.0, depth);
  vec3 Rw = mix(vec3(0.0025, 0.016, 0.040), vec3(0.006, 0.034, 0.038), coastal);
  vec3 Lwater = Rw * Ed / PI;
  // Fondo visible en aguas someras: atenuación por canal (el rojo se absorbe primero).
  vec3 Kd = vec3(0.38, 0.085, 0.055);
  vec4 n2 = texture(uNoiseTex, P / 37.0);
  vec3 bedAlb = mix(vec3(0.42, 0.37, 0.27), vec3(0.15, 0.15, 0.11), smoothstep(0.5, 0.78, nz.b * 0.6 + n2.r * 0.5 + smoothstep(1.5, 9.0, depth) * 0.2)) * (0.85 + 0.3 * n2.b);
  float pathK = 1.0 + 1.0 / max(sqrt(1.0 - (1.0 - nv * nv) / 1.77), 0.3);   // bajada + subida refractada
  vec3 att = exp(-Kd * depth * pathK);
  vec3 Lbed = bedAlb * Ed / PI;
  vec3 Lbody = mix(Lwater, Lbed, att);

  // ---- espuma ----
  float foam = 0.0;
  // Rompiente en la orilla: líneas finas de espuma que avanzan hacia la playa. Se usa la
  // distancia aproximada a la línea de costa (profundidad / pendiente del fondo) para que
  // los bajíos extensos no queden cubiertos de espuma.
  vec2 bn = textureLod(uNormalTex, terrUV(P), lodH).rg * 2.0 - 1.0;
  float bedSlope = max(length(bn) / sqrt(max(1.0 - dot(bn, bn), 0.05)), 0.004);
  float dShore = depth / bedSlope;                       // metros hasta la orilla (aprox.)
  float shoreK = (1.0 - smoothstep(4.0, 38.0, dShore)) * (1.0 - smoothstep(0.3, 1.5, depth));
  float fTex = texture(uNoiseTex, P / 9.0 + vec2(uSea.x * 0.02, 0.0)).b * 0.6 + n2.a * 0.5;
  float band = sin(dShore * 0.42 + uSea.x * 1.1 + nz.r * 12.0 + n2.r * 2.0);
  foam += shoreK * smoothstep(0.55, 1.0, band * 0.5 + 0.5) * smoothstep(0.35, 0.75, fTex + shoreK * 0.25);
  foam += (1.0 - smoothstep(0.0, 2.2, dShore)) * (1.0 - smoothstep(0.0, 0.12, depth)) * smoothstep(0.3, 0.6, fTex) * 0.9;
  // Borreguillos según el viento (Monahan): cobertura ~ U^3.4
  float cover = clamp(3.84e-6 * pow(max(uSea.y, 0.0), 3.41), 0.0, 0.2) * shoal;
  vec2 adv = uSea.zw * uSea.x * 0.9;
  float wc = texture(uNoiseTex, (P - adv) / 61.0).r * 0.6 + texture(uNoiseTex, (P - adv * 0.6) / 17.0).b * 0.4;
  float crest = dot(slope, uSea.zw) / max(sigma, 0.02);
  foam += smoothstep(1.0 - cover * 4.0, 1.0 - cover * 1.5, 1.0 - wc + crest * 0.02) * smoothstep(100.0, 20.0, fPerp * 40.0);
  foam = clamp(foam, 0.0, 1.0);
  vec3 Lfoam = vec3(0.82) * Ed / PI;

  vec3 col = Lbody * (1.0 - fres) + Lsky * fres + spec;
  col = mix(col, Lfoam, foam * 0.92);

  // ---- atmósfera entre la cámara y el agua ----
  vec3 ins, tr;
  aerialPerspective(gl_FragCoord.xy / uViewport, t, ins, tr);
  float far = smoothstep(0.75, 0.95, t / uAtmoCam.z);
  vec3 inFar = skyRadiance(dir);
  vec3 trFar = vec3(skyTransmittance(dir));
  return col * mix(tr, trFar, far) + mix(ins, inFar, far);
}
`;

export class Ocean {
  constructor(gl) {
    this.gl = gl;
    this.waves = new Float32Array(NUM_WAVES * 4);
    this.phases = new Float32Array(NUM_WAVES);
    this._key = '';
    this.sea = [0, 0, 1, 0];
  }

  // Construye el espectro discreto de olas para un viento dado (dir = de dónde viene, grados).
  build(windDirDeg, speed) {
    const key = `${windDirDeg.toFixed(1)}|${speed.toFixed(2)}`;
    if (key === this._key) return;
    this._key = key;
    const rnd = rng(1234);
    const U = Math.max(speed, 1.0);
    const to = ((windDirDeg + 180) * Math.PI) / 180; // hacia dónde sopla
    const toDir = [Math.sin(to), -Math.cos(to)];
    this.toDir = toDir;
    const lMax = Math.min(Math.max(0.9 * U * U, 14), 220);
    const lMin = 0.45;
    const n = NUM_WAVES - 2;
    const steep = 0.014 + 0.0032 * U; // pendiente (k·a) por ola
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const lambda = lMax * Math.pow(lMin / lMax, f) * (0.88 + 0.24 * rnd());
      const k = (2 * Math.PI) / lambda;
      const spread = (rnd() - 0.5) * (0.7 + 1.5 * f);
      const a = Math.atan2(toDir[0], -toDir[1]) + spread;
      const dx = Math.sin(a), dz = -Math.cos(a);
      const omega = Math.sqrt(9.81 * k);
      const amp = (steep * (0.75 + 0.5 * rnd())) / k;
      this.waves.set([dx * k, dz * k, omega, amp], i * 4);
      this.phases[i] = rnd() * Math.PI * 2;
    }
    // Mar de fondo: dos olas largas de otra dirección.
    for (let j = 0; j < 2; j++) {
      const lambda = 150 + 90 * j;
      const k = (2 * Math.PI) / lambda;
      const a = Math.atan2(toDir[0], -toDir[1]) + 0.9 + 0.5 * j;
      this.waves.set([Math.sin(a) * k, -Math.cos(a) * k, Math.sqrt(9.81 * k), 0.011 / k], (n + j) * 4);
      this.phases[n + j] = rnd() * Math.PI * 2;
    }
    // Orden de mayor a menor longitud de onda.
  }

  seaUniform(env) {
    this.build(env.wind.dir, env.wind.speed);
    return [env.time, env.wind.speed, this.toDir[0], this.toDir[1]];
  }

  bind(prog, env) {
    prog.set('uSea', this.seaUniform(env));
    prog.set('uWaves', this.waves);
    prog.set('uWavePhase', this.phases);
  }
}
