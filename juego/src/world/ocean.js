// Océano (versión inicial): color base con reflejo de cielo; se ampliará con olas y espuma.
export const GLSL_OCEAN = /* glsl */`
vec3 oceanColor(vec3 dir, float t) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - max(-dir.y, 0.0), 5.0);
  vec3 refl = skyRadianceSoft(reflect(dir, n));
  vec3 sunT = lightTransmittance(0.0, uSunDir.y);
  vec3 deep = vec3(0.004, 0.022, 0.045) * (uSunE * sunT * max(uSunDir.y, 0.0) + skyIrradiance(n));
  vec3 col = mix(deep, refl, fres);
  float Tv = skyTransmittance(dir);
  return col * Tv + skyRadiance(dir);
}
`;
export class Ocean {
  constructor(gl) { this.gl = gl; }
  bind(prog, env) {}
}
