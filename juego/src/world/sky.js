// Pase de fondo: cielo (LUT), disco solar, Luna, estrellas y Vía Láctea; y el océano
// analítico (intersección del rayo con la esfera del nivel del mar).
import { GLSL_HEADER, FULLSCREEN_VS, Program, drawFullscreen } from '../core/gl.js';
import { GLSL_HASH } from './glslNoise.js';
import { GLSL_ATMO_SCENE } from './atmosphere.js';
import { GLSL_TERRAIN_SAMPLING } from './terrain.js';
import { GLSL_OCEAN } from './ocean.js';

const FS = `${GLSL_HEADER}
${GLSL_HASH}
${GLSL_ATMO_SCENE}
${GLSL_TERRAIN_SAMPLING}
uniform vec3 uRay00, uRay10, uRay01, uRay11;
uniform vec3 uCamPos;       // mundo
uniform float uTime;
uniform float uExposure;
uniform float uPixelAngle;  // radianes por píxel
uniform mat3 uStarRot;
uniform float uMoonFrac;
${GLSL_OCEAN}
in vec2 vUV;
out vec4 o;

const float SUN_RADIUS = 0.004654;   // radio angular (rad)
const float MOON_RADIUS = 0.00452;

vec3 starField(vec3 dir) {
  vec3 d = uStarRot * dir;
  const float S = 70.0;
  vec3 p = d * S;
  vec3 cell = floor(p);
  vec3 rnd = hash33(cell + 500.0);
  vec3 rnd2 = hash33(cell + 931.0);
  vec3 col = vec3(0.0);
  if (rnd2.x < 0.16) {
    vec3 sp = normalize(cell + 0.15 + 0.7 * rnd);
    float ang = length(d - sp);
    float sig = max(uPixelAngle * 0.9, 0.00045);
    float mag = pow(rnd2.y, 9.0) * 1.0 + 0.012;
    float tw = 0.75 + 0.25 * sin(uTime * (3.0 + rnd2.z * 9.0) + rnd.x * 40.0);
    vec3 tint = mix(vec3(1.0, 0.82, 0.62), vec3(0.72, 0.84, 1.0), rnd.y);
    col = tint * (mag * tw * exp(-ang * ang / (sig * sig)));
    // Compensar el tamaño del píxel para que el brillo no dependa de la resolución.
    col *= (0.0009 * 0.0009) / (sig * sig);
  }
  // Vía Láctea: banda difusa sobre un círculo máximo.
  vec3 gp = normalize(vec3(0.38, 0.62, 0.69));
  float band = exp(-pow(dot(d, gp) * 3.4, 2.0));
  float nz = hash31(floor(d * 220.0)) * 0.5 + hash31(floor(d * 90.0)) * 0.5;
  col += vec3(0.75, 0.82, 1.0) * band * (0.0018 + 0.0035 * nz * nz);
  return col * 2.4e-6;
}

void main() {
  vec3 dir = normalize(mix(mix(uRay00, uRay10, vUV.x), mix(uRay01, uRay11, vUV.x), vUV.y));
  const float R = 6360000.0;
  float h = max(uCamPos.y, 1.5);
  float b = (R + h) * dir.y, c = h * (2.0 * R + h), disc = b * b - c;
  vec3 col;
  if (disc > 0.0 && b < 0.0) {
    float t = -b - sqrt(disc);
    col = oceanColor(dir, t);
  } else {
    col = skyRadiance(dir);
    vec3 T = lightTransmittance(h, dir.y);
    // Sol
    float cs = dot(dir, uSunDir);
    float ang = acos(clamp(cs, -1.0, 1.0));
    float edge = 1.0 - smoothstep(SUN_RADIUS - uPixelAngle, SUN_RADIUS + uPixelAngle * 0.5, ang);
    if (edge > 0.0) {
      float r = clamp(ang / SUN_RADIUS, 0.0, 1.0);
      float mu = sqrt(max(1.0 - r * r, 0.0));
      vec3 limb = vec3(1.0) - vec3(0.55, 0.65, 0.78) * (1.0 - mu);
      col += min(uSunE * T * limb * (edge / (PI * SUN_RADIUS * SUN_RADIUS)), vec3(60000.0));
    }
    // Luna
    float cm = dot(dir, uMoonDir);
    float angM = acos(clamp(cm, -1.0, 1.0));
    float edgeM = 1.0 - smoothstep(MOON_RADIUS - uPixelAngle, MOON_RADIUS + uPixelAngle * 0.5, angM);
    float starVis = 1.0;
    if (edgeM > 0.0) {
      vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
      vec3 mu2 = cross(uMoonDir, mr);
      vec2 q = vec2(dot(dir, mr), dot(dir, mu2)) / MOON_RADIUS;
      float z = sqrt(max(1.0 - dot(q, q), 0.0));
      vec3 n = normalize(mr * q.x + mu2 * q.y - uMoonDir * z);
      float lit = pow(max(dot(n, uSunDir), 0.0), 0.6);
      float maria = 0.55 + 0.45 * smoothstep(0.35, 0.65, hash31(floor(vec3(q * 3.0, 1.0))) * 0.5 + hash31(floor(vec3(q * 7.0, 5.0))) * 0.5);
      // El brillo de la Luna usa la iluminancia solar sin exposición nocturna excesiva.
      vec3 sunTOA = uSunE;
      col += sunTOA * T * (0.12 / PI) * lit * maria * edgeM;
      starVis = 1.0 - edgeM;
    }
    col += starField(dir) * uExposure * T * starVis;
  }
  o = vec4(col, 1.0);
}`;

export class Sky {
  constructor(gl) {
    this.gl = gl;
    this.prog = new Program(gl, FULLSCREEN_VS, FS, 'sky');
  }
  render(cam, atmosphere, terrain, env, viewport, exposure, ocean) {
    const gl = this.gl, p = this.prog.use();
    atmosphere.bind(p, viewport);
    terrain.bindSampling(p);
    p.set('uRay00', cam.rays[0]).set('uRay10', cam.rays[1]).set('uRay01', cam.rays[2]).set('uRay11', cam.rays[3]);
    p.set('uCamPos', cam.pos[0], cam.pos[1], cam.pos[2]).set('uTime', env.time).set('uExposure', exposure);
    p.set('uPixelAngle', (2 * Math.tan(cam.fovY / 2)) / viewport[1]);
    p.set('uStarRot', env.starRot).set('uMoonFrac', env.moonFraction);
    if (ocean) ocean.bind(p, env);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    drawFullscreen(gl);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
  }
}
