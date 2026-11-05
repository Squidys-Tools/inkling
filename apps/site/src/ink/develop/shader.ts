export const vertexSource = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const header = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
const float ASPECT = 1376.0 / 768.0;
`;

// Sim space is the 1376x768 moodboard frame with GL's bottom-up v. Velocities are in sim cells per second.
// The emitters and the wind are shared by the velocity and dye steps so ink and push always line up.
// The develop front is ragged along y and drifts, so ink never arrives as a straight wall.
const frontLine = `
float frontAt(float y) {
  return uFront + 0.14 * (texture(uFlow, vec2(y * 0.9, uTime * 0.015)).r - 0.5);
}
`;

const flowField = `
uniform float uTime;
uniform float uFront;

vec2 wind(vec2 uv) {
  float slow = 1.0 - 0.75 * smoothstep(0.32, 0.62, uv.x);
  float sway = 3.0 * sin(uv.x * 7.0 - uTime * 0.4) * (1.0 - smoothstep(0.3, 0.55, uv.x));
  return vec2(26.0 * slow, sway);
}

vec3 emit(vec2 uv) {
  vec3 sum = vec3(0.0);
  vec2 p = vec2(uv.x * ASPECT, uv.y);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float y = 0.15 + fi * 0.083 + 0.05 * sin(uTime * (0.21 + fi * 0.04) + fi * 1.9);
    vec2 d = (p - vec2(-0.04, y)) * vec2(0.5, 1.0);
    float g = exp(-dot(d, d) / 0.00035);
    float pulse = 0.1 + 0.9 * smoothstep(0.1, 0.9, sin(uTime * (0.7 + fi * 0.19) + fi * 2.3));
    float angle = (y - 0.47) * 1.6 + 0.9 * sin(uTime * (0.38 + fi * 0.09) + fi * 1.3) + 0.25 * sin(uTime * 1.3 + fi);
    sum += vec3(cos(angle), sin(angle), 1.0) * g * pulse;
  }
  return sum;
}
`;

/** One-time: R is the smoke envelope, G the photo's darkness, B the photo blob. */
export const targetSource = `${header}
uniform sampler2D uStill;
uniform sampler2D uMask;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float WATER_LUMA = 0.944;

float darkness(vec3 c) {
  return clamp((WATER_LUMA - dot(c, LUMA)) / WATER_LUMA, 0.0, 1.0);
}

void main() {
  vec2 fu = vec2(vUv.x, 1.0 - vUv.y);
  float blob = texture(uMask, fu).r;
  float band = darkness(textureLod(uStill, fu, 4.0).rgb);
  float smoke = clamp(band * 2.6, 0.0, 1.0) * (1.0 - blob) * (1.0 - smoothstep(0.36, 0.5, fu.x));
  float photo = darkness(textureLod(uStill, fu, 0.6).rgb);
  outColor = vec4(smoke, photo, blob, 1.0);
}
`;

export const copySource = `${header}
uniform sampler2D uSource;
void main() {
  outColor = texture(uSource, vUv);
}
`;

export const seedSource = `${header}
uniform sampler2D uTarget;
uniform sampler2D uFlow;
uniform float uFront;
void main() {
  vec4 tg = texture(uTarget, vUv);
  float patch_ = smoothstep(0.45, 0.8, texture(uFlow, vUv * vec2(3.1, 1.9)).r);
  float arrived = 1.0 - smoothstep(uFront - 0.08, uFront + 0.02, vUv.x);
  outColor = vec4(tg.r * patch_ * 0.4 + tg.g * tg.b * arrived, 0.0, 0.0, 1.0);
}
`;

export const velocitySource = `${header}
${flowField}
uniform sampler2D uVelocity;
uniform sampler2D uTarget;
uniform sampler2D uFlow;
uniform vec2 uTexel;
uniform float uDt;
uniform float uForm;
uniform vec4 uPointer;

void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  vec2 back = vUv - uDt * (v + wind(vUv)) * uTexel;
  v = texture(uVelocity, back).xy * exp(-uDt * 0.8);

  vec3 jet = emit(vUv);
  v = mix(v, jet.xy / max(jet.z, 0.0001) * 70.0, clamp(jet.z, 0.0, 1.0) * 0.3);

  vec2 a = texture(uFlow, vUv * vec2(1.8, 1.1) + vec2(-uTime * 0.025, uTime * 0.009)).rg * 2.0 - 1.0;
  vec2 b = texture(uFlow, vUv * vec2(5.5, 3.1) + vec2(-uTime * 0.07, -uTime * 0.02)).rg * 2.0 - 1.0;
  float loose = 1.0 - smoothstep(0.4, 0.7, vUv.x);
  v += (a + 0.18 * b) * 55.0 * uDt * (0.35 + 0.65 * loose);

  vec2 cell = uTexel * 2.0;
  vec2 lean = vec2(
    texture(uTarget, vUv + vec2(cell.x, 0.0)).r - texture(uTarget, vUv - vec2(cell.x, 0.0)).r,
    texture(uTarget, vUv + vec2(0.0, cell.y)).r - texture(uTarget, vUv - vec2(0.0, cell.y)).r);
  v += lean * 60.0 * uDt;

  vec2 toPointer = (vUv - uPointer.xy) * vec2(ASPECT, 1.0);
  v += uPointer.zw * exp(-dot(toPointer, toPointer) / 0.004);

  float blob = texture(uTarget, vUv).b;
  float calm = blob * uForm * (1.0 - smoothstep(uFront - 0.05, uFront + 0.05, vUv.x));
  v *= 1.0 - clamp(calm * uDt * 6.0, 0.0, 1.0);
  outColor = vec4(v, 0.0, 1.0);
}
`;

export const curlSource = `${header}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  outColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}
`;

export const vorticitySource = `${header}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uDt;
uniform float uStrength;
void main() {
  float l = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float t = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float b = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float c = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
  force /= length(force) + 0.0001;
  force *= uStrength * c * vec2(1.0, -1.0);
  vec2 v = texture(uVelocity, vUv).xy + force * uDt;
  outColor = vec4(clamp(v, -120.0, 120.0), 0.0, 1.0);
}
`;

export const divergenceSource = `${header}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  outColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}
`;

export const pressureSource = `${header}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  outColor = vec4(0.25 * (l + r + t + b - div), 0.0, 0.0, 1.0);
}
`;

export const gradientSource = `${header}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  vec2 v = texture(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
  outColor = vec4(v, 0.0, 1.0);
}
`;

// Guidance: smoke is topped up inside the moodboard's smoke envelope through a drifting patchy gate, and once the
// front passes, ink in the blob relaxes toward the photo's darkness. Everything else dissipates into clear water.
export const dyeSource = `${header}
${flowField}
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform sampler2D uTarget;
uniform sampler2D uFlow;
uniform vec2 uSimTexel;
uniform float uDt;
uniform float uCondense;
${frontLine}

void main() {
  vec2 back = vUv - uDt * (texture(uVelocity, vUv).xy + wind(vUv)) * uSimTexel;
  float d = texture(uDye, back).r;
  vec4 tg = texture(uTarget, vUv);

  float edge = max(uFront, 0.4);
  float reach = 1.0 - smoothstep(edge - 0.03, edge + 0.09, vUv.x);
  float clear = 1.0 - clamp(tg.r * 2.0 + tg.b, 0.0, 1.0);
  d *= exp(-uDt * (0.08 + 0.6 * d + 0.9 * clear + 3.0 * (1.0 - reach)));

  d += emit(vUv).z * 2.6 * uDt;

  float arrived = 1.0 - smoothstep(frontAt(vUv.y) - 0.12, frontAt(vUv.y), vUv.x);
  d += (tg.g - d) * tg.b * arrived * uCondense * uDt;

  outColor = vec4(clamp(d, 0.0, 1.6), 0.0, 0.0, 1.0);
}
`;

// WATER and INK mirror inkDevelopColor.water and inkDevelopColor.ink, so the canvas meets the page edge invisibly.
// uStill is the moodboard frame, read only for the photo's colour inside the blob (uMask).
export const renderSource = `${header}
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform float uTime;
uniform float uFront;
uniform float uBloom;
uniform float uCell;
uniform float uMix;
uniform vec2 uDyeTexel;
uniform sampler2D uDye;
uniform sampler2D uDyePrev;
uniform sampler2D uStill;
uniform sampler2D uMask;
uniform sampler2D uFlow;
${frontLine}
const vec3 WATER = vec3(0.953, 0.945, 0.925);
const vec3 INK = vec3(0.047, 0.047, 0.055);
const vec3 WASH = vec3(0.3, 0.315, 0.345);
const vec2 BLOOM_FROM = vec2(0.8, 0.44);
const mat2 ROT = mat2(0.7071, 0.7071, -0.7071, 0.7071);

float ink(vec2 su) {
  return mix(texture(uDyePrev, su).r, texture(uDye, su).r, uMix);
}

float band(float edge, float width, float x) {
  return 1.0 - smoothstep(edge - width, edge, x);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 fu = (frag - uFrame.xy) / uFrame.zw;
  if (fu.x < 0.0 || fu.x > 1.0 || fu.y < 0.0 || fu.y > 1.0) {
    outColor = vec4(WATER, 1.0);
    return;
  }
  vec2 su = vec2(fu.x, 1.0 - fu.y);

  vec2 fine = texture(uFlow, fu * vec2(11.0, 6.0) + vec2(-uTime * 0.04, uTime * 0.01)).rg - 0.5;
  vec2 sp = su + fine * uDyeTexel * 0.8;
  float d0 = ink(sp);
  vec2 o = uDyeTexel * 1.25;
  float r = ink(sp + vec2(o.x, 0.0));
  float l = ink(sp - vec2(o.x, 0.0));
  float t = ink(sp + vec2(0.0, o.y));
  float b = ink(sp - vec2(0.0, o.y));
  float d = max(d0 + 1.0 * (d0 - 0.25 * (r + l + t + b)), 0.0);

  float edge = clamp(length(vec2(r - l, t - b)) * 2.2, 0.0, 1.0) * smoothstep(0.05, 0.3, d);
  float cover = clamp(smoothstep(0.1, 0.42, d) + edge * 0.5, 0.0, 1.0);
  float core = smoothstep(0.24, 0.62, d);
  vec3 smoke = mix(WATER, mix(WASH, INK, max(core, edge * 0.7)), cover);

  vec2 hp = ROT * frag / uCell;
  vec2 cellCenter = transpose(ROT) * ((floor(hp) + 0.5) * uCell);
  vec2 cellFu = (cellCenter - uFrame.xy) / uFrame.zw;
  float cellInk = clamp(ink(vec2(cellFu.x, 1.0 - cellFu.y)), 0.0, 1.0);
  float radius = 0.6 * pow(cellInk, 0.8);
  float dist = length(fract(hp) - 0.5);
  float aa = 0.75 / uCell;
  float dots = smoothstep(dist - aa, dist + aa, radius) * step(aa, radius);
  vec3 halftone = mix(WATER, INK, dots * 0.96);

  float behind = 1.0 - smoothstep(frontAt(su.y) - 0.16, frontAt(su.y) - 0.02, fu.x + fine.x * 0.06);
  float condensed = smoothstep(0.29, 0.47, fu.x + fine.y * 0.05) * behind;
  vec3 col = mix(smoke, halftone, condensed);

  float blob = texture(uMask, fu).r;
  float reach = length((fu - BLOOM_FROM) * vec2(ASPECT, 1.0)) + (d - 0.5) * 0.08 + fine.x * 0.12;
  float colour = band(uBloom * 1.1, 0.22, reach) * blob;
  col = mix(col, texture(uStill, fu).rgb, colour);

  outColor = vec4(col, 1.0);
}
`;
