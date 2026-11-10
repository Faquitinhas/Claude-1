// Sombra del avión: constantes y función de consulta GLSL compartida por los shaders receptores.
export const SHADOW_RES = 2048;
export const SHADOW_HALF = 8.0;     // semilado de la proyección ortográfica (m)
export const SHADOW_NEAR = -12, SHADOW_FAR = 300;

// Consulta de la sombra del avión para shaders receptores (terreno, el propio avión).
export const GLSL_AC_SHADOW = /* glsl */`
uniform highp sampler2DShadow uAcShadowTex;
uniform mat4 uAcShadowMat;   // posición relativa a cámara -> clip de sombra
uniform vec4 uAcShadowP;     // x: activa, y: 1/res, z: rango de profundidad (m), w: profundidad del avión (m)
float aircraftShadow(vec3 rel, float bias) {
  if (uAcShadowP.x < 0.5) return 1.0;
  vec4 sc = uAcShadowMat * vec4(rel, 1.0);
  vec3 s = sc.xyz * 0.5 + 0.5;
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0 || s.z <= 0.0) return 1.0;
  float d = max(s.z * uAcShadowP.z - uAcShadowP.w, 0.0);       // metros por detrás del avión
  // La penumbra crece con la distancia (diámetro angular del Sol).
  float r = uAcShadowP.y * 1.2 + d * 0.0047 / ${(2 * SHADOW_HALF).toFixed(1)};
  float z = s.z - bias;
  float sh = texture(uAcShadowTex, vec3(s.xy, z)) * 2.0;
  sh += texture(uAcShadowTex, vec3(s.xy + vec2(r, 0.0), z));
  sh += texture(uAcShadowTex, vec3(s.xy - vec2(r, 0.0), z));
  sh += texture(uAcShadowTex, vec3(s.xy + vec2(0.0, r), z));
  sh += texture(uAcShadowTex, vec3(s.xy - vec2(0.0, r), z));
  sh += texture(uAcShadowTex, vec3(s.xy + vec2(r, r) * 0.7, z));
  sh += texture(uAcShadowTex, vec3(s.xy - vec2(r, r) * 0.7, z));
  sh += texture(uAcShadowTex, vec3(s.xy + vec2(r, -r) * 0.7, z));
  sh += texture(uAcShadowTex, vec3(s.xy + vec2(-r, r) * 0.7, z));
  sh /= 10.0;
  // Lejos del avión la sombra se difumina hasta desaparecer.
  float fade = 1.0 - smoothstep(60.0, 260.0, d);
  vec2 e = abs(s.xy - 0.5) * 2.0;
  fade *= 1.0 - smoothstep(0.85, 1.0, max(e.x, e.y));
  return mix(1.0, sh, fade);
}
`;

