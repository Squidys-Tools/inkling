const shared = /* glsl */ `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uFocus;

const vec3 INK = vec3(0.07, 0.068, 0.066);
const vec3 PAPER = vec3(0.972, 0.966, 0.948);

vec3 water(vec2 uv) {
  vec3 deep = vec3(0.885, 0.879, 0.864);
  vec3 surface = vec3(0.982, 0.979, 0.968);
  return mix(deep, surface, smoothstep(-0.15, 1.1, uv.y));
}

// Tileable water caustic after Dave Hoskins: bright filaments in 0..1.
float caustic(vec2 p, float t) {
  p = mod(p * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float s = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(s - i.x) + sin(s + i.y), sin(s - i.y) + cos(s + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + s) / 0.005), p.y / (cos(i.y + s) / 0.005)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

float blurFor(float depth) {
  float off = abs(depth - uFocus);
  float f = smoothstep(0.08, 2.2, off);
  return 0.15 * f + 0.012 * max(off - 2.2, 0.0) + 0.09 * smoothstep(1.6, 0.4, depth);
}

float fogFor(float depth) {
  return 1.0 - exp(-max(depth - 1.2, 0.0) * 0.042);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`;

export const quadVertex = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aCorner;
out vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}
`;

export const backgroundFragment = /* glsl */ `#version 300 es
${shared}
uniform float uTravel;
uniform vec2 uPointer;
in vec2 vUv;
out vec4 outColor;

float specks(vec2 uv, float scale, float drift) {
  vec2 p = uv * scale + vec2(0.0, drift);
  vec2 cell = floor(p);
  vec2 local = fract(p) - 0.5;
  float h = hash(cell);
  vec2 offset = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
  float d = length(local - offset * 0.7);
  return step(0.86, h) * smoothstep(0.06, 0.0, d);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec3 color = water(uv);

  vec2 source = vec2(0.5 + uPointer.x * 0.05, 1.45);
  vec2 toSource = (uv - source) * vec2(aspect, 1.0);
  float angle = atan(toSource.x, -toSource.y);
  float rays = sin(angle * 23.0 + uTime * 0.05) * 0.5 + 0.5;
  rays *= sin(angle * 41.0 - uTime * 0.035 + 1.7) * 0.5 + 0.5;
  rays *= sin(angle * 7.0 + uTime * 0.02) * 0.5 + 0.5;
  float reach = smoothstep(0.0, 1.0, uv.y) * smoothstep(1.25, 0.55, length(toSource));
  color += vec3(1.0, 0.998, 0.99) * pow(rays, 1.5) * reach * 0.045;

  float horizon = 1.25 - uv.y;
  vec2 floorUv = vec2((uv.x - 0.5) * aspect / horizon, 1.0 / horizon + uTravel * 0.02);
  float light = caustic(floorUv * 0.42, uTime * 0.16);
  float floorMask = smoothstep(0.62, 0.0, uv.y);
  color += (light - 0.3) * 0.075 * floorMask;
  float ceiling = caustic(vec2(uv.x * aspect, uv.y * 0.6) * 0.5 + 0.13, uTime * 0.12);
  color += ceiling * 0.03 * smoothstep(0.55, 1.0, uv.y);

  vec2 su = vec2(uv.x * aspect, uv.y) + uPointer * 0.01;
  float dust = specks(su, 34.0, uTravel * 0.9 + uTime * 0.01) * 0.10;
  dust += specks(su + 4.2, 19.0, uTravel * 1.6 + uTime * 0.016) * 0.07;
  color = mix(color, INK, dust);

  color += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}
`;

export const cardVertex = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aCorner;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec2 uHalf;
uniform float uMargin;
out vec2 vLocal;
out vec3 vWorld;
out float vDepth;
void main() {
  vec2 local = aCorner * (uHalf + uMargin);
  vec4 world = uModel * vec4(local, 0.0, 1.0);
  vec4 view = uView * world;
  vLocal = local;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = uProjection * view;
}
`;

export const cardFragment = /* glsl */ `#version 300 es
${shared}
uniform sampler2D uImage;
uniform vec2 uHalf;
uniform float uBorder;
uniform float uWriting;
uniform float uTexelsPerUnit;
uniform float uReady;
in vec2 vLocal;
in vec3 vWorld;
in float vDepth;
out vec4 outColor;

float roundRect(vec2 p, vec2 size, float r) {
  vec2 q = abs(p) - size + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 soft(vec2 uv, float radius, float lod) {
  if (radius < 0.0015) return textureLod(uImage, uv, lod);
  vec4 sum = vec4(0.0);
  float spin = hash(gl_FragCoord.xy) * 6.28318;
  for (int i = 0; i < 16; i++) {
    float f = float(i) + 0.5;
    float r = sqrt(f / 16.0) * radius;
    float a = f * 2.39996 + spin;
    sum += textureLod(uImage, clamp(uv + vec2(cos(a), sin(a)) * r, 0.0, 1.0), lod);
  }
  return sum / 16.0;
}

void main() {
  float blur = blurFor(vDepth);
  float sharp = 1.0 - smoothstep(0.0, 0.11, blur);
  float edge = max(blur, fwidth(vLocal.x) * 1.2);
  float shape = 1.0 - smoothstep(-edge, edge, roundRect(vLocal, uHalf, 0.012));

  vec2 inner = uHalf - uBorder;
  vec2 uv = vec2(vLocal.x / inner.x, -vLocal.y / inner.y) * 0.5 + 0.5;
  float lod = log2(max(blur * uTexelsPerUnit * 0.5 / 2.5, 1.0));
  vec4 sampled = soft(clamp(uv, 0.0, 1.0), blur * 0.25 / inner.y, lod);

  vec3 color;
  if (uWriting > 0.5) {
    color = mix(PAPER, INK, sampled.a * uReady);
  } else {
    float inside = 1.0 - smoothstep(-edge, edge, roundRect(vLocal, inner, 0.002));
    vec3 image = mix(PAPER * 0.9, sampled.rgb, uReady);
    float grey = dot(image, vec3(0.299, 0.587, 0.114));
    image = mix(vec3(grey), image, 0.42 + 0.58 * sharp);
    image = mix(image, PAPER, 0.16 * (1.0 - sharp));
    color = mix(PAPER, image, inside);
  }

  float grain = hash(floor(vLocal * 900.0)) - 0.5;
  color += grain * 0.012;
  float light = caustic(vWorld.xz * 0.55 + vec2(0.0, vWorld.y * 0.15), uTime * 0.16);
  color *= 0.95 + light * 0.11 + 0.04 * sharp;

  vec3 behind = water(gl_FragCoord.xy / uResolution);
  color = mix(color, behind, fogFor(vDepth) * 0.92);

  float alpha = shape;
  alpha *= smoothstep(0.35, 1.1, vDepth) * (1.0 - smoothstep(19.0, 26.0, vDepth));
  alpha *= 1.0 - 0.25 * smoothstep(0.05, 0.2, blur) * smoothstep(1.2, 3.5, vDepth);
  outColor = vec4(color * alpha, alpha);
}
`;

export const wispVertex = /* glsl */ `#version 300 es
${shared}
layout(location = 0) in vec2 aStrand;
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec3 uFrom;
uniform vec3 uTo;
uniform vec3 uBendFrom;
uniform vec3 uBendTo;
uniform float uSeed;
uniform float uWidth;
out float vSide;
out float vAlpha;
out float vDepth;

vec3 path(float t) {
  float u = 1.0 - t;
  vec3 p = u * u * u * uFrom + 3.0 * u * u * t * uBendFrom + 3.0 * u * t * t * uBendTo + t * t * t * uTo;
  float lift = pow(sin(3.14159 * t), 0.7) * (0.35 + 0.65 * t);
  float s = uSeed * 6.0;
  vec3 curl = vec3(
    sin(t * 7.0 + uTime * 0.31 + s) * 0.11 + sin(t * 17.0 - uTime * 0.23 + s * 1.3) * 0.035,
    cos(t * 5.0 + uTime * 0.27 + s * 1.7) * 0.13 + sin(t * 13.0 + uTime * 0.19 + s) * 0.04,
    sin(t * 9.0 - uTime * 0.21 + s * 0.6) * 0.09
  );
  return p + curl * lift;
}

void main() {
  float t = aStrand.x;
  vec4 view = uView * vec4(path(t), 1.0);
  vec4 here = uProjection * view;
  vec4 ahead = uProjection * uView * vec4(path(min(t + 0.01, 1.0)) , 1.0);
  vec4 back = uProjection * uView * vec4(path(max(t - 0.01, 0.0)), 1.0);
  vec2 direction = (ahead.xy / ahead.w - back.xy / back.w) * uResolution;
  vec2 normal = normalize(vec2(-direction.y, direction.x) + 1e-5);

  float depth = -view.z;
  float blurPx = blurFor(depth) * uResolution.y / max(depth, 0.3) * 0.6;
  float pulse = 0.55 + 0.45 * sin(t * 11.0 - uTime * 0.4 + uSeed * 9.0);
  float thin = uWidth * (0.5 + 0.9 * pulse) * (0.4 + 0.6 * t);
  float width = thin + blurPx;

  vSide = aStrand.y;
  vDepth = depth;
  vAlpha = (thin / width) * smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.82, t);
  vAlpha *= smoothstep(0.4, 1.2, depth) * (1.0 - smoothstep(16.0, 24.0, depth));
  vAlpha *= 0.6 + 0.4 * sin(t * 4.0 + uTime * 0.17 + uSeed * 3.0);

  here.xy += normal * aStrand.y * width / uResolution * here.w;
  gl_Position = here;
}
`;

export const wispFragment = /* glsl */ `#version 300 es
${shared}
uniform float uStrength;
in float vSide;
in float vAlpha;
in float vDepth;
out vec4 outColor;
void main() {
  float across = 1.0 - smoothstep(0.0, 1.0, abs(vSide));
  float alpha = across * vAlpha * uStrength;
  vec3 color = mix(INK, water(gl_FragCoord.xy / uResolution), fogFor(vDepth) * 0.9);
  outColor = vec4(color * alpha, alpha);
}
`;
