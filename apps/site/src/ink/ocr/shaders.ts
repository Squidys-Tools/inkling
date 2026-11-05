const noise = /* glsl */ `
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
        mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
    mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
        mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

vec2 curlNoise(vec2 p, float t) {
  float e = 0.05;
  float n = gnoise(vec3(p, t)) + 0.5 * gnoise(vec3(p * 2.1 + 3.7, t * 1.3));
  float nx = gnoise(vec3(p + vec2(e, 0.0), t)) + 0.5 * gnoise(vec3((p + vec2(e, 0.0)) * 2.1 + 3.7, t * 1.3));
  float ny = gnoise(vec3(p + vec2(0.0, e), t)) + 0.5 * gnoise(vec3((p + vec2(0.0, e)) * 2.1 + 3.7, t * 1.3));
  return vec2(ny - n, n - nx) / e;
}
`;

// The sim covers this slice of the moodboard plate: st (0..1, y down) maps to plate uv x 0.15..0.85, y 0..1.
const domain = /* glsl */ `
vec2 plateUv(vec2 st) {
  return vec2(0.15 + 0.7 * st.x, st.y);
}
`;

// Signed distance in plate pixels to the RAMEN chip drawn on the receipt.
const chip = /* glsl */ `
float chipDistance(vec2 uv) {
  vec2 q = abs((uv - vec2(0.4993, 0.5)) * vec2(1376.0, 768.0)) - vec2(80.0, 12.0);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 30.0;
}
`;

export const quadVertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const head = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform vec2 uTexel;
`;

export const curlFragment = /* glsl */ `${head}
uniform sampler2D uVelocity;
out vec4 outValue;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  outValue = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}
`;

// Self-advection, vorticity confinement and every force on the water in one pass.
export const velocityFragment = /* glsl */ `${head}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform sampler2D uDye;
uniform sampler2D uMask;
uniform float uDt;
uniform float uTime;
uniform float uGuide;
uniform float uPour;
uniform float uHit;
uniform vec2 uSource;
uniform vec4 uPointer;
out vec4 outValue;
${noise}
${domain}
void main() {
  vec2 st = vUv;
  vec2 here = texture(uVelocity, st).xy;
  vec2 vel = texture(uVelocity, st - uDt * here * uTexel).xy;

  float l = texture(uCurl, st - vec2(uTexel.x, 0.0)).x;
  float r = texture(uCurl, st + vec2(uTexel.x, 0.0)).x;
  float t = texture(uCurl, st + vec2(0.0, uTexel.y)).x;
  float b = texture(uCurl, st - vec2(0.0, uTexel.y)).x;
  float c = texture(uCurl, st).x;
  vec2 swirl = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
  swirl /= length(swirl) + 0.0001;
  vel += swirl * vec2(1.0, -1.0) * c * 18.0 * uDt;

  vec2 p = plateUv(st);
  float dye = texture(uDye, st).r;
  vec4 mask = textureLod(uMask, p, 1.0);
  vec2 e = vec2(0.02, 0.03);
  vec2 pull = vec2(
    textureLod(uMask, p + vec2(e.x, 0.0), 4.0).r - textureLod(uMask, p - vec2(e.x, 0.0), 4.0).r,
    textureLod(uMask, p + vec2(0.0, e.y), 4.0).r - textureLod(uMask, p - vec2(0.0, e.y), 4.0).r
  );
  vec2 glowSlope = vec2(
    textureLod(uMask, p + vec2(e.x, 0.0), 3.0).b - textureLod(uMask, p - vec2(e.x, 0.0), 3.0).b,
    textureLod(uMask, p + vec2(0.0, e.y), 3.0).b - textureLod(uMask, p - vec2(0.0, e.y), 3.0).b
  );

  float cells = 1.0 / uTexel.y;
  vel.y += uDt * min(dye, 1.0) * 8.0 * (1.0 - 0.8 * mask.r);
  vel += uDt * min(dye, 1.5) * uGuide * pull * cells * 1.6 * (1.0 - mask.r);
  vel -= uDt * min(dye, 1.5) * uHit * glowSlope * cells * 2.2;
  vel += uDt * curlNoise(st * vec2(2.4, 2.0) + vec2(0.0, -uTime * 0.04), uTime * 0.09) * (9.0 + 16.0 * mask.r);

  vec2 jet = (st - uSource) / uTexel;
  float nozzle = exp(-dot(jet, jet) / 9.0) * uPour;
  vel += uDt * nozzle * vec2(14.0 * sin(uTime * 0.9), 120.0);

  vec2 hand = (st - uPointer.xy) / uTexel;
  vel += uPointer.zw * exp(-dot(hand, hand) / 70.0);

  vel *= exp(-uDt * (0.35 + 2.6 * mask.g));
  vec2 inside = step(uTexel, st) * step(st, 1.0 - uTexel);
  outValue = vec4(vel * inside.x * inside.y, 0.0, 1.0);
}
`;

export const divergenceFragment = /* glsl */ `${head}
uniform sampler2D uVelocity;
out vec4 outValue;
void main() {
  vec2 c = texture(uVelocity, vUv).xy;
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  if (vUv.x - uTexel.x < 0.0) l = -c.x;
  if (vUv.x + uTexel.x > 1.0) r = -c.x;
  if (vUv.y + uTexel.y > 1.0) t = -c.y;
  if (vUv.y - uTexel.y < 0.0) b = -c.y;
  outValue = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}
`;

export const pressureFragment = /* glsl */ `${head}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform float uKeep;
out vec4 outValue;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float d = texture(uDivergence, vUv).x;
  outValue = vec4(uKeep * (l + r + t + b - d) * 0.25, 0.0, 0.0, 1.0);
}
`;

export const projectFragment = /* glsl */ `${head}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
out vec4 outValue;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
  outValue = vec4(vel, 0.0, 1.0);
}
`;

// Carries ink on the flow, pours it in at the surface and relaxes it toward the board's plume.
// Without float render targets uProcedural swaps the solved flow for curl noise.
export const dyeFragment = /* glsl */ `${head}
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform sampler2D uMask;
uniform vec2 uSimTexel;
uniform float uDt;
uniform float uTime;
uniform float uGuide;
uniform float uPour;
uniform float uHit;
uniform float uCatchUp;
uniform float uProcedural;
uniform vec2 uSource;
out vec4 outValue;
${noise}
${domain}
${chip}
void main() {
  vec2 st = vUv;
  vec2 vel = texture(uVelocity, st).xy;
  if (uProcedural > 0.5) {
    vel = curlNoise(st * vec2(3.2, 2.6) + vec2(0.0, -uTime * 0.05), uTime * 0.11) * 3.2 + vec2(0.0, 9.0);
  }
  vec2 carried = texture(uDye, st - uDt * vel * uSimTexel).rg;
  float dye = carried.r;
  float streak = carried.g;
  float seed = smoothstep(-0.18, 0.18, gnoise(vec3(st * vec2(30.0, 24.0), uTime * 0.015)));
  streak += (seed - streak) * (1.0 - exp(-uDt * 0.12));

  vec2 p = plateUv(st);
  vec4 mask = textureLod(uMask, p, 1.0);
  float target = pow(smoothstep(0.015, 0.7, mask.r), 0.65);
  float grain = gnoise(vec3(st * vec2(4.2, 3.4) + vec2(0.0, -uTime * 0.05), uTime * 0.14));
  grain += 0.5 * gnoise(vec3(st * vec2(9.0, 7.2), uTime * 0.2 + 4.0));
  float want = min(2.0, target * (1.5 + 1.3 * mask.g) * smoothstep(-0.32, 0.18, grain));
  float rate = dye < want ? (1.8 + uCatchUp) * uGuide : 0.3 + 0.3 * (1.0 - target);
  dye += (want - dye) * (1.0 - exp(-uDt * rate));

  vec2 jet = (st - uSource) / uSimTexel;
  float pulse = smoothstep(-0.2, 0.6, gnoise(vec3(uTime * 0.8, st.x * 30.0, 1.0)));
  dye += uDt * uPour * 4.5 * pulse * exp(-dot(jet * vec2(0.22, 0.8), jet * vec2(0.22, 0.8)) / 2.0);
  dye *= 1.0 - uDt * (1.0 + 3.0 * uHit) * (1.0 - smoothstep(4.0, 26.0, chipDistance(p)));
  dye *= smoothstep(0.035, 0.06, st.y);
  outValue = vec4(clamp(dye, 0.0, 2.0), streak, 0.0, 1.0);
}
`;

export const compositeFragment = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uStill;
uniform sampler2D uClean;
uniform sampler2D uMask;
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform vec2 uResolution;
uniform vec2 uDyeTexel;
uniform vec2 uSimTexel;
uniform vec4 uFrame;
uniform float uTime;
uniform float uLag;
uniform float uHit;
out vec4 outColor;
${noise}
${chip}

void main() {
  vec2 screen = gl_FragCoord.xy / uResolution;
  vec2 uv = uFrame.xy + vec2(screen.x, 1.0 - screen.y) * uFrame.zw;
  vec2 st = vec2((uv.x - 0.15) / 0.7, uv.y);
  float inDomain = step(0.0, st.x) * step(st.x, 1.0);

  vec2 vel = texture(uVelocity, st).xy;
  vec2 inside = clamp(uv - vel * uSimTexel * 0.006, vec2(0.001), vec2(0.999));
  vec4 mask = texture(uMask, inside);
  vec3 color = texture(uClean, inside).rgb;

  vec2 at = st - vel * uSimTexel * uLag;
  vec2 fine = vec2(gnoise(vec3(st * vec2(22.0, 18.0), uTime * 0.35)), gnoise(vec3(st * vec2(22.0, 18.0) + 9.1, uTime * 0.35)));
  at += fine * uDyeTexel * 0.35;
  vec2 sample_ = texture(uDye, at).rg;
  float d = sample_.r;
  float l = texture(uDye, at - vec2(uDyeTexel.x * 1.5, 0.0)).r;
  float r = texture(uDye, at + vec2(uDyeTexel.x * 1.5, 0.0)).r;
  float t = texture(uDye, at + vec2(0.0, uDyeTexel.y * 1.5)).r;
  float b = texture(uDye, at - vec2(0.0, uDyeTexel.y * 1.5)).r;
  float soft = 0.25 * (l + r + t + b);
  d = max(0.0, d + 0.25 * (d - soft)) * inDomain;

  d *= mix(mix(0.3, 1.55, sample_.g), 1.0, smoothstep(1.1, 2.2, d));
  float body = 1.0 - exp(-pow(d, 1.15) * 2.0);
  float edge = chipDistance(uv);
  float pill = 1.0 - smoothstep(-2.0, 2.0, edge);
  body *= 1.0 - 0.95 * pill;
  float core = smoothstep(0.5, 0.96, body);
  float glowWide = textureLod(uMask, inside, 3.0).b;
  vec3 wisp = mix(vec3(0.3, 0.33, 0.37), vec3(0.2, 0.28, 0.62), glowWide * uHit * 0.8);
  vec3 ink = mix(wisp, vec3(0.04, 0.045, 0.055), core);
  float paper = mask.g * (1.0 - smoothstep(0.4, 0.8, mask.b) * uHit);
  color = mix(color, ink, clamp(body * (1.0 - 0.18 * paper), 0.0, 0.96));

  float glow = mask.b;
  float ring = smoothstep(0.5, 0.9, glow);
  float zone = max(pill, ring * (1.0 - smoothstep(0.0, 24.0, edge)));
  color = mix(color, texture(uClean, inside).rgb, max(ring * 0.9, pill) * uHit);
  float blue = smoothstep(0.08, 0.22, color.b - max(color.r, color.g));
  float grey = dot(color, vec3(0.299, 0.587, 0.114));
  grey += (0.88 - grey) * blue * pill * (1.0 - uHit);
  vec3 dim = vec3(grey + (0.9 - grey) * 0.65 * smoothstep(0.3, 0.62, grey)) * vec3(0.97, 0.985, 1.0);
  color = mix(color, vec3(grey) * vec3(0.97, 0.985, 1.0), glow * (1.0 - uHit));
  color = mix(color, dim, zone * (1.0 - uHit));
  float pulse = 0.85 + 0.15 * sin(uTime * 1.7);
  color += vec3(0.1, 0.16, 0.6) * glow * glow * uHit * pulse * 0.24;
  color += vec3(0.04, 0.07, 0.25) * glowWide * uHit * body * 0.5;

  float below = smoothstep(0.96, 1.0, uv.y);
  if (below > 0.0) {
    vec3 deep = textureLod(uStill, vec2(clamp(uv.x, 0.0, 1.0), 0.985), 5.0).rgb;
    color = mix(color, deep, below);
  }
  float above = 1.0 - smoothstep(-0.03, 0.0, uv.y);
  if (above > 0.0) {
    vec3 air = textureLod(uStill, vec2(clamp(uv.x, 0.0, 1.0), 0.004), 4.0).rgb;
    color = mix(color, mix(air, vec3(0.962, 0.962, 0.955), clamp(-uv.y * 30.0, 0.0, 1.0)), above);
  }

  float vignette = smoothstep(0.35, 1.3, length((screen - 0.5) * vec2(uResolution.x / uResolution.y * 0.7, 1.0)));
  color *= 1.0 - 0.05 * vignette;
  color += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}
`;

export const copyFragment = /* glsl */ `${head}
uniform sampler2D uSource;
out vec4 outValue;
void main() {
  outValue = texture(uSource, vUv);
}
`;
