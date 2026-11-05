// Stable-fluids passes for the ink between the cards. Velocity lives in aspect space
// (x spans the width over the height, y spans 0..1) on a square-texel grid, so the
// divergence and gradient stencils need no aspect factor.
const head = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uTexel;
`;

export const curlFragment = /* glsl */ `${head}
uniform sampler2D uVelocity;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}
`;

const puffs = /* glsl */ `
const int PUFFS = 6;
uniform vec4 uPuffShape[PUFFS];
uniform vec4 uPuffMotion[PUFFS];
uniform float uAspect;
`;

export const forceFragment = /* glsl */ `${head}
${puffs}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform sampler2D uGuide;
uniform float uDt;
uniform float uTime;
uniform float uSwirl;
uniform vec2 uPointer;
uniform vec2 uStir;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + 1.0), f - 1.0), u.x),
    u.y);
}

float stream(vec2 p) {
  float t = uTime;
  return noise(p * 2.2 + vec2(t * 0.05, -t * 0.03)) * 0.6
    + noise(p * 5.0 + vec2(-t * 0.09, t * 0.07) + 3.7) * 0.25;
}

void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  float l = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float c = texture(uCurl, vUv).x;
  vec2 confine = vec2(abs(t) - abs(b), abs(r) - abs(l));
  confine /= length(confine) + 1e-4;
  v += confine * vec2(1.0, -1.0) * c * uSwirl * uDt;

  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float e = 0.01;
  vec2 drift = vec2(stream(p + vec2(0.0, e)) - stream(p - vec2(0.0, e)),
                    stream(p - vec2(e, 0.0)) - stream(p + vec2(e, 0.0))) / (2.0 * e);
  v += (drift * 0.035 + vec2(0.0, 0.004) - v) * 0.6 * uDt;

  vec4 g = texture(uGuide, vUv);
  v += g.yz * 0.12 * uDt;

  for (int i = 0; i < PUFFS; i++) {
    vec4 s = uPuffShape[i];
    vec4 m = uPuffMotion[i];
    if (s.z <= 0.0) continue;
    vec2 d = p - vec2(s.x * uAspect, s.y);
    float w = exp(-dot(d, d) / (s.z * s.z));
    v += (vec2(-d.y, d.x) / s.z * s.w + m.xy * m.z) * w * uDt * 6.0;
  }

  vec2 dp = p - vec2(uPointer.x * uAspect, uPointer.y);
  v += uStir * exp(-dot(dp, dp) / 0.012);
  outColor = vec4(v, 0.0, 1.0);
}
`;

export const divergenceFragment = /* glsl */ `${head}
uniform sampler2D uVelocity;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  outColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}
`;

export const pressureFragment = /* glsl */ `${head}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  outColor = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
}
`;

export const gradientFragment = /* glsl */ `${head}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 v = texture(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
  outColor = vec4(v, 0.0, 1.0);
}
`;

export const advectFragment = /* glsl */ `${head}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uAspect;
uniform float uKeep;
void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  vec2 from = vUv - uDt * v * vec2(1.0 / uAspect, 1.0);
  outColor = vec4(texture(uSource, from).xy * uKeep, 0.0, 1.0);
}
`;

// Ink is carried by the flow, fed along the guide strands in travelling pulses, and relaxed
// toward the guide so the composition keeps settling back between the cards.
export const dyeFragment = /* glsl */ `${head}
${puffs}
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform sampler2D uGuide;
uniform float uDt;
uniform float uTime;
uniform float uSeed;
void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  vec2 from = vUv - uDt * v * vec2(1.0 / uAspect, 1.0);
  float d = texture(uDye, from).x;
  vec4 g = texture(uGuide, vUv);
  float along = g.w / max(g.x, 1e-3);
  float pulse = smoothstep(0.35, 0.95, 0.5 + 0.5 * sin(along * 11.0 - uTime * 0.9));
  float target = min(g.x, 1.0);
  d += target * (0.08 + 1.1 * pulse) * uDt;
  d += (target * 0.3 - d) * 0.42 * uDt;
  d = max(d, target * 0.3 * uSeed);

  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  for (int i = 0; i < PUFFS; i++) {
    vec4 s = uPuffShape[i];
    if (s.z <= 0.0) continue;
    vec2 q = p - vec2(s.x * uAspect, s.y);
    float r = s.z * 0.55;
    d += uPuffMotion[i].w * exp(-dot(q, q) / (r * r)) * uDt * 0.5;
  }
  outColor = vec4(clamp(d, 0.0, 2.5), 0.0, 0.0, 1.0);
}
`;
