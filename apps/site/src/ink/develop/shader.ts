export const vertexSource = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// WATER and INK mirror inkDevelopColor.water and inkDevelopColor.ink, so the canvas meets the page edge invisibly.
export const fragmentSource = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform vec4 uRect;
uniform float uForm;
uniform float uBloom;
uniform float uDissolve;
uniform float uSeed;
uniform float uReady;
uniform sampler2D uImage;

out vec4 outColor;

const vec3 WATER = vec3(0.953, 0.945, 0.925);
const vec3 INK = vec3(0.047, 0.047, 0.055);
const mat2 OCTAVE = mat2(1.6, 1.2, -1.2, 1.6);

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * noise(p);
    p = OCTAVE * p;
    amp *= 0.5;
  }
  return sum;
}

vec2 curl(vec2 p) {
  const float e = 0.02;
  float n1 = fbm(p + vec2(0.0, e), 3);
  float n2 = fbm(p - vec2(0.0, e), 3);
  float n3 = fbm(p + vec2(e, 0.0), 3);
  float n4 = fbm(p - vec2(e, 0.0), 3);
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

float smoke(vec2 p, float t) {
  vec2 q = p + 0.35 * curl(p * 0.5 + vec2(uSeed, t * 0.03));
  q += 0.16 * curl(q * 1.4 + vec2(-t * 0.045, uSeed * 0.7));
  float n = fbm(q * 1.25 + vec2(-t * 0.08, 0.0), 5);
  float wisps = pow(clamp(1.0 - abs(n * 2.6), 0.0, 1.0), 14.0);
  float m = fbm(q * 0.85 + vec2(5.2 - t * 0.05, 1.3), 4);
  float strokes = pow(clamp(1.0 - abs(m * 2.2), 0.0, 1.0), 22.0);
  float streams = smoothstep(-0.22, 0.22, fbm(q * 0.45 + vec2(9.0, uSeed), 3));
  return clamp((wisps * 0.9 + strokes * 1.6) * streams, 0.0, 1.0);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 center = uRect.xy;
  vec2 half_ = uRect.zw;
  float unit = uResolution.y;
  float t = uTime;

  vec2 local = (frag - center) / half_;
  float aspect = half_.x / half_.y;

  float edgeNoise = fbm(local * vec2(aspect, 1.0) * 1.7 + uSeed * 3.0 + vec2(0.0, t * 0.02), 4);
  vec2 box = abs(local) - vec2(0.7);
  float sd = length(max(box, 0.0)) + min(max(box.x, box.y), 0.0) - 0.22;
  sd += edgeNoise * 0.8;

  float grow = mix(-1.3, 0.0, uForm) - uDissolve * 1.5;
  float erosion = (fbm(local * 6.0 + vec2(t * 0.12, uSeed), 3)) * 0.25 * uDissolve;
  float field = sd - grow + erosion;
  float mask = smoothstep(0.06, -0.06, field);
  float rim = exp(-abs(field) * 5.0);

  // Plumes travel from the left edge into the image and, while dissolving, on past it.
  float s = frag.x / center.x;
  float bandY = center.y + unit * 0.06 * sin(s * 2.6 + t * 0.15 + uSeed);
  float bandH = mix(unit * 0.42, half_.y * 1.05, smoothstep(0.0, 1.0, s));
  float across = abs(frag.y - bandY) / bandH;
  float band = smoothstep(1.15, 0.25, across + 0.25 * fbm(frag / unit * 2.0 + uSeed, 3));
  float arrival = mix(-0.25, 1.15, smoothstep(0.0, 0.85, uForm)) + uDissolve * 1.6;
  float front = smoothstep(arrival + 0.18, arrival - 0.12, s);
  float tail = smoothstep(uDissolve * 1.9 - 0.45, uDissolve * 1.9, s);
  float spent = mix(1.0, 0.42, uBloom);
  float feed = 1.0 + 1.4 * smoothstep(0.35, 0.95, s) * smoothstep(1.25, 0.9, s) * uForm * (1.0 - uBloom);
  float envelope = band * front * tail * spent * feed;

  vec2 toCenter = (center - frag) / unit;
  float pull = uForm * (1.0 - uBloom * 0.6) * 0.28 * exp(-length(toCenter) * 0.8);
  vec2 p = frag / unit * 1.6 - toCenter * pull + vec2(-t * 0.06 - uForm * 0.5 + uDissolve * 0.8, 0.0);
  float ink = smoke(p, t) * envelope;
  ink = max(ink, smoke(p * 1.3 + 7.0, t) * rim * (uForm - uBloom * 0.7) * 0.9 * (1.0 - uDissolve * 0.5));

  float grain = fbm(frag / unit * 3.0 + t * 0.01, 3);
  vec3 water = WATER * (1.0 - 0.018 * grain) + (hash1(frag + fract(t)) - 0.5) * 0.012;

  vec2 uv = clamp(local * 0.5 + 0.5, 0.0, 1.0);
  float cellSize = 6.5 * uScale;
  const mat2 ROT = mat2(0.7071, 0.7071, -0.7071, 0.7071);
  vec2 hp = ROT * frag / cellSize;
  vec2 cell = floor(hp) + 0.5;
  vec2 cellCenter = transpose(ROT) * (cell * cellSize);
  vec2 cellUv = clamp((cellCenter - center) / half_ * 0.5 + 0.5, 0.0, 1.0);
  vec3 cellColor = texture(uImage, cellUv).rgb;
  vec3 pixelColor = texture(uImage, uv).rgb;
  float lum = dot(cellColor, vec3(0.299, 0.587, 0.114));
  float darkness = mix(0.55, smoothstep(0.12, 1.0, 1.0 - lum), uReady);

  float radial = length(local * vec2(aspect, 1.0)) / max(aspect, 1.0);
  radial += (fbm(local * 2.4 + uSeed * 5.0, 4)) * 0.45;
  float bloomFront = uBloom * 1.75 - 0.15;
  float color = smoothstep(bloomFront, bloomFront - 0.35, radial) * uReady;

  float dotFringe = smoothstep(0.22, -0.12, field);
  float radius = 0.5 * 0.98 * pow(darkness, 0.65) * (1.0 - color) * dotFringe;
  float dist = length(fract(hp) - 0.5);
  float aa = 0.9 / cellSize;
  float dotCover = smoothstep(radius + aa, radius - aa, dist) * step(0.001, radius);

  vec3 tinted = mix(water, pixelColor, 0.2 * uReady);
  vec3 col = mix(water, tinted, mask);
  col = mix(col, pixelColor, color * mask);
  col = mix(col, INK, dotCover * 0.94);

  float smokeAlpha = smoothstep(0.02, 0.75, ink) * (1.0 - mask * mix(0.8, 1.0, uBloom));
  col = mix(col, INK, smokeAlpha * 0.92);

  outColor = vec4(col, 1.0);
}
`;
