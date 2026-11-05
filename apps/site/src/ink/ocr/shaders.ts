const noise = /* glsl */ `
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
        mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
    mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
        mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y),
    u.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * gnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum;
}
`;

// Signed Voronoi tents: each cell is a facet pushed up or down, and the shared edges are the folds.
const crumple = /* glsl */ `
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float facets(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float side = 1.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y);
      vec2 o = hash2(cell + g);
      float d = length(g + o - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        side = o.x > 0.5 ? 1.0 : -1.0;
      } else if (d < d2) {
        d2 = d;
      }
    }
  return side * (d2 - d1);
}

float crease(vec2 p) {
  return 1.0 - smoothstep(0.0, 0.06, abs(facets(p * 3.4)));
}

float crumple(vec2 p, float t) {
  float h = 0.05 * facets(p * 3.4);
  h += 0.016 * facets(p * 8.3 + 4.1);
  h += 0.008 * gnoise(vec3(p * 9.0, 2.0));
  h += 0.08 * sin(p.y * 2.2 + 0.6) * cos(p.x * 1.4);
  h += 0.022 * sin(p.y * 3.1 - t * 0.7) * sin(p.x * 2.3 + t * 0.45);
  return h;
}
`;

export const paperVertex = /* glsl */ `#version 300 es
in vec2 aUv;
uniform mat4 uProjection;
uniform mat4 uModelView;
uniform vec2 uSize;
uniform float uTime;
out vec2 vUv;
out vec2 vLocal;
out float vDepth;
${noise}
${crumple}
void main() {
  vUv = aUv;
  vec2 local = (aUv - 0.5) * uSize * vec2(1.0, -1.0);
  vLocal = local;
  vec3 position = vec3(local, crumple(local, uTime));
  vec4 view = uModelView * vec4(position, 1.0);
  vDepth = -view.z;
  gl_Position = uProjection * view;
}
`;

export const paperFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vLocal;
in float vDepth;
uniform sampler2D uReceipt;
uniform mat3 uNormalMatrix;
uniform vec4 uWord;
uniform float uTime;
uniform float uHit;
uniform float uFog;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outMask;
${noise}
${crumple}

float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float tear = 0.006 + 0.006 * (gnoise(vec3(vLocal * 38.0, 2.0)) + 1.0);
  if (edge < tear) discard;

  float e = 0.002;
  float h = crumple(vLocal, uTime);
  float hx = crumple(vLocal + vec2(e, 0.0), uTime);
  float hy = crumple(vLocal + vec2(0.0, e), uTime);
  vec3 normal = normalize(vec3(h - hx, h - hy, e));
  if (!gl_FrontFacing) normal = -normal;
  normal = normalize(uNormalMatrix * normal);

  float fold = crease(vLocal);
  vec3 light = normalize(vec3(-0.35, 0.8, 0.6));
  float diffuse = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(normal.z, 0.0), 2.0);
  vec3 paper = vec3(0.93, 0.94, 0.95) * (0.74 + 0.3 * diffuse) - fold * 0.035;
  paper += vec3(0.75, 0.82, 0.92) * rim * 0.12;
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  paper += pow(max(dot(normal, halfway), 0.0), 48.0) * 0.12;

  float ink = gl_FrontFacing ? texture(uReceipt, vUv).a : 0.0;
  ink *= 0.84 - 0.3 * fold + 0.08 * gnoise(vec3(vUv * 180.0, 1.0));
  vec3 color = mix(paper, vec3(0.16, 0.17, 0.2), clamp(ink, 0.0, 1.0));
  color = mix(color, vec3(0.9, 0.91, 0.91), uFog);

  vec2 texel = vec2(768.0, 1152.0);
  vec2 center = (uWord.xy + uWord.zw * 0.5) * texel;
  vec2 half_ = uWord.zw * 0.5 * texel + vec2(17.0, 21.0);
  float d = roundBox(vUv * texel - center, half_, 24.0);
  float ring = (1.0 - smoothstep(3.0, 7.0, abs(d))) * (gl_FrontFacing ? 1.0 : 0.0);
  float inside = (1.0 - smoothstep(-4.0, 4.0, d)) * (gl_FrontFacing ? 1.0 : 0.0);

  outColor = vec4(color, 1.0);
  outMask = vec4(ring * uHit, inside, 1.0, 1.0);
}
`;

export const quadVertex = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const compositeFragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uMask;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uTime;
uniform float uHit;
uniform float uInk;
uniform float uSurface;
out vec4 outColor;
${noise}

vec3 water(vec2 uv, float aspect) {
  vec3 top = vec3(0.958, 0.952, 0.936);
  vec3 deep = vec3(0.885, 0.894, 0.9);
  vec3 color = mix(deep, top, smoothstep(-0.1, 1.05, uv.y));
  float bands = gnoise(vec3(uv.x * 1.2 * aspect, uv.y * 7.0, uTime * 0.025));
  color += 0.022 * smoothstep(-0.2, 0.6, bands);
  float shafts = gnoise(vec3(uv.x * 3.2 * aspect + uv.y * 0.9, 0.0, uTime * 0.04));
  color += 0.03 * pow(max(shafts, 0.0), 1.6) * smoothstep(0.1, 0.95, uv.y);
  return color;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  vec2 wobble = vec2(
    gnoise(vec3(p * 2.6, uTime * 0.22)),
    gnoise(vec3(p * 2.6 + 11.3, uTime * 0.22 + 4.0))
  );
  wobble += 0.45 * vec2(gnoise(vec3(p * 7.0, uTime * 0.35 + 2.0)), gnoise(vec3(p * 7.0 + 5.1, uTime * 0.35)));
  vec2 ruv = uv + wobble * vec2(0.0045, 0.0065);

  vec3 color = water(uv, aspect);

  float focus = textureLod(uMask, ruv, 2.0).g * uHit;
  vec4 sharp = texture(uScene, ruv);
  vec4 soft = textureLod(uScene, ruv, 1.35);
  vec4 scene = mix(soft, sharp, clamp(focus * 1.6, 0.0, 1.0));
  float coverage = textureLod(uMask, ruv, 0.6).b;
  color = mix(color, scene.rgb / max(scene.a, 0.001), clamp(scene.a, 0.0, 1.0) * 0.97);
  color -= 0.035 * (textureLod(uMask, ruv + vec2(0.012, -0.03), 4.5).b - coverage * 0.5) * (1.0 - coverage);

  vec2 q = (uv - uCenter) * vec2(aspect, 1.0);
  vec2 drift = vec2(0.0, uTime * 0.018);
  vec2 warp = vec2(fbm(vec3(q * 1.5 + drift, uTime * 0.03)), fbm(vec3(q * 1.5 - drift + 6.2, uTime * 0.03 + 3.0)));
  vec2 w = q + warp * 0.5;
  float tendril = 1.0 - abs(fbm(vec3(w * 2.6, uTime * 0.045)) * 2.0);
  tendril = pow(clamp(tendril, 0.0, 1.0), 14.0);
  float mass = smoothstep(-0.12, 0.38, fbm(vec3(w * 1.9 + 2.0, uTime * 0.025)));
  float around = exp(-dot(q * vec2(1.6, 1.25), q * vec2(1.6, 1.25)) * 5.0);
  float below = exp(-dot((q + vec2(0.05, 0.3)) * vec2(2.6, 2.2), (q + vec2(0.05, 0.3)) * vec2(2.6, 2.2)) * 3.0);
  float trailX = q.x + 0.1 * sin(q.y * 5.0 + uTime * 0.15) + 0.06 * warp.x;
  float above = smoothstep(0.1, 0.35, q.y) * exp(-trailX * trailX * 70.0) * smoothstep(uSurface + 0.01, uSurface - 0.2, uv.y);
  float density = (tendril * 0.4 + mass * 0.85) * (around * 0.75 + below * 1.6) + (tendril * 0.5 + mass * 0.3 + 0.08) * above;
  density *= uInk;
  float glowWide = textureLod(uMask, ruv, 4.0).r;
  density *= 1.0 - clamp(glowWide * 3.0, 0.0, 0.85);
  color = mix(color, vec3(0.1, 0.105, 0.115), clamp(density, 0.0, 0.78));

  float wave = 0.006 * gnoise(vec3(uv.x * 9.0 * aspect, 0.0, uTime * 0.3)) + 0.003 * gnoise(vec3(uv.x * 31.0 * aspect, 1.0, uTime * 0.5));
  float s = uv.y - (uSurface + wave);
  float air = smoothstep(0.0, 0.004, s);
  vec4 dry = texture(uScene, uv);
  vec3 dryColor = mix(vec3(0.972, 0.968, 0.958), dry.rgb / max(dry.a, 0.001) * 1.04, dry.a);
  color = mix(color, dryColor, air);
  color -= 0.11 * exp(-abs(s) * 520.0) + 0.035 * exp(-max(-s, 0.0) * 60.0) * step(s, 0.0);

  vec3 cobalt = vec3(0.231, 0.357, 1.0);
  float ring = texture(uMask, ruv).r;
  float glow = textureLod(uMask, ruv, 2.0).r * 1.2 + textureLod(uMask, ruv, 3.5).r * 1.6 + textureLod(uMask, ruv, 5.0).r * 1.8;
  float inside = texture(uMask, ruv).g * uHit;
  glow *= 1.0 - 0.85 * inside;
  color = mix(color, min(color * 1.07 + 0.02, vec3(1.0)), inside);
  color = mix(color, cobalt, clamp(glow * 0.42, 0.0, 0.65));
  color += vec3(0.2, 0.3, 0.9) * glow * 0.22;
  color = mix(color, mix(cobalt, vec3(0.86, 0.9, 1.0), 0.4), clamp(ring * 1.25, 0.0, 1.0));

  float vignette = smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(aspect * 0.8, 1.0)));
  color *= mix(0.94, 1.0, vignette);
  color += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}
`;
