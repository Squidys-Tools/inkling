const shared = /* glsl */ `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uCaustic;

const vec3 INK = vec3(0.045, 0.044, 0.043);
const vec3 PAPER = vec3(0.958, 0.952, 0.936);

vec3 water(vec2 uv) {
  vec3 deep = vec3(0.842, 0.836, 0.822);
  vec3 mid = vec3(0.905, 0.9, 0.888);
  vec3 surface = vec3(0.975, 0.972, 0.962);
  vec3 color = mix(deep, mid, smoothstep(0.0, 0.45, uv.y));
  return mix(color, surface, smoothstep(0.45, 1.05, uv.y));
}

float fogFor(float depth) {
  return 1.0 - exp(-max(depth - 2.0, 0.0) * 0.13);
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

// Tileable caustic network: warped Voronoi cell borders, baked each frame into a small repeating texture.
export const causticFragment = /* glsl */ `#version 300 es
precision highp float;
uniform float uTime;
in vec2 vUv;
out vec4 outColor;

vec2 point(vec2 cell, float period, float t) {
  vec2 c = mod(cell, period);
  vec2 h = fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))) * 43758.5453);
  return 0.5 + 0.38 * sin(t + 6.28318 * h);
}

float borders(vec2 p, float period, float t) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 d = o + point(cell + o, period, t) - local;
      float l = dot(d, d);
      if (l < f1) {
        f2 = f1;
        f1 = l;
      } else if (l < f2) {
        f2 = l;
      }
    }
  }
  return sqrt(f2) - sqrt(f1);
}

void main() {
  vec2 uv = vUv;
  vec2 warp = vec2(sin(6.28318 * (uv.y * 2.0) + uTime * 0.7), sin(6.28318 * (uv.x * 2.0) - uTime * 0.6)) * 0.035;
  float a = borders((uv + warp) * 6.0, 6.0, uTime);
  float b = borders((uv - warp * 1.3 + 0.37) * 9.0, 9.0, uTime * 1.3 + 2.0);
  float light = exp(-a * 13.0) * 0.85 + exp(-b * 16.0) * 0.4;
  light = clamp(pow(light, 1.6), 0.0, 1.0);
  outColor = vec4(light, light, light, 1.0);
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
  return step(0.9, h) * (1.0 - smoothstep(0.0, 0.07, d));
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec3 color = water(uv);

  vec2 source = vec2(0.5 + uPointer.x * 0.04, 1.6);
  vec2 toSource = (uv - source) * vec2(aspect, 1.0);
  float angle = atan(toSource.x, -toSource.y);
  float rays = sin(angle * 19.0 + uTime * 0.045) * 0.5 + 0.5;
  rays *= sin(angle * 37.0 - uTime * 0.03 + 1.7) * 0.5 + 0.5;
  rays = rays * 0.75 + 0.25 * (sin(angle * 7.0 + uTime * 0.02) * 0.5 + 0.5);
  float fan = 1.0 - smoothstep(0.1, 0.75, abs(angle));
  float reach = smoothstep(0.05, 0.95, uv.y) * fan;
  color += vec3(1.0, 0.998, 0.99) * pow(rays, 1.6) * reach * 0.13;
  color += vec3(0.02) * (1.0 - smoothstep(0.0, 0.6, length(toSource - vec2(0.0, 0.25)))) ;

  float horizon = 1.18 - uv.y;
  vec2 floorUv = vec2((uv.x - 0.5) * aspect / horizon, 1.0 / horizon + uTravel);
  float bias = log2(max(fwidth(floorUv.y) * 512.0, 1.0));
  float light = texture(uCaustic, floorUv * 0.5, bias * 0.4).r;
  float floorMask = 1.0 - smoothstep(0.12, 0.6, uv.y);
  color += light * 0.24 * floorMask;
  color -= 0.035 * floorMask * (1.0 - light);
  float ceiling = texture(uCaustic, vec2(uv.x * aspect, uv.y * 0.55) * 0.6 + vec2(0.13, uTravel * 0.2)).r;
  color += ceiling * 0.025 * smoothstep(0.6, 1.0, uv.y);

  vec2 su = vec2(uv.x * aspect, uv.y) + uPointer * 0.01;
  float dust = specks(su, 34.0, uTravel * 9.0 + uTime * 0.01) * 0.12;
  dust += specks(su + 4.2, 19.0, uTravel * 16.0 + uTime * 0.016) * 0.08;
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

// Depth of field comes from the mip chain: one blur radius per card picks a level, and a
// four-tap B-spline at that level hides the bilinear blockiness. No per-pixel blur loops.
export const cardFragment = /* glsl */ `#version 300 es
${shared}
uniform sampler2D uImage;
uniform vec2 uHalf;
uniform float uBorder;
uniform float uWriting;
uniform float uTexelsPerUnit;
uniform float uReady;
uniform float uBlur;
uniform float uFade;
in vec2 vLocal;
in vec3 vWorld;
in float vDepth;
out vec4 outColor;

float roundRect(vec2 p, vec2 size, float r) {
  vec2 q = abs(p) - size + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 cubic(vec2 uv, float lod) {
  vec2 size = vec2(textureSize(uImage, int(lod)));
  vec2 p = uv * size - 0.5;
  vec2 f = fract(p);
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 s0 = w0 + w1;
  vec2 s1 = w2 + w3;
  vec2 base = floor(p) + 0.5;
  vec2 t0 = (base - 1.0 + w1 / s0) / size;
  vec2 t1 = (base + 1.0 + w3 / s1) / size;
  vec4 a = mix(textureLod(uImage, vec2(t1.x, t0.y), lod), textureLod(uImage, vec2(t0.x, t0.y), lod), s0.x);
  vec4 b = mix(textureLod(uImage, vec2(t1.x, t1.y), lod), textureLod(uImage, vec2(t0.x, t1.y), lod), s0.x);
  return mix(b, a, s0.y);
}

void main() {
  float sharp = 1.0 - smoothstep(0.004, 0.05, uBlur);
  float edge = max(uBlur, fwidth(vLocal.x) * 0.9);
  float shape = 1.0 - smoothstep(-edge, edge, roundRect(vLocal, uHalf, 0.01));

  vec2 inner = uHalf - uBorder;
  vec2 uv = clamp(vec2(vLocal.x / inner.x, -vLocal.y / inner.y) * 0.5 + 0.5, 0.0, 1.0);
  float lod = log2(max(uBlur * uTexelsPerUnit * 1.6, 1.0));
  vec4 sampled = lod > 0.4 ? cubic(uv, lod) : texture(uImage, uv);

  vec3 color;
  if (uWriting > 0.5) {
    color = mix(PAPER, INK, sampled.a * uReady * (0.6 + 0.4 * sharp));
  } else {
    float inside = 1.0 - smoothstep(-edge, edge, roundRect(vLocal, inner, 0.002));
    vec3 image = mix(PAPER * 0.9, sampled.rgb, uReady);
    float grey = dot(image, vec3(0.299, 0.587, 0.114));
    image = mix(vec3(grey), image, 0.42 + 0.3 * sharp);
    image = mix(vec3(0.5), image, 0.82) + 0.05;
    image = mix(image, PAPER, 0.1 + 0.32 * (1.0 - sharp));
    color = mix(PAPER, image, inside);
  }

  float grain = hash(floor(vLocal * 700.0)) - 0.5;
  color += grain * 0.014 * sharp;
  vec2 cp = vec2(vWorld.x * 0.3 + vWorld.y * 0.1, vWorld.z * 0.3 - vWorld.y * 0.18);
  float light = texture(uCaustic, cp, 1.0 + uBlur * 40.0).r;
  float shade = 0.5 + 0.5 * vLocal.y / uHalf.y;
  color *= 0.91 + light * 0.15 + 0.05 * shade;

  vec3 behind = water(gl_FragCoord.xy / uResolution);
  color = mix(color, behind, fogFor(vDepth) * 0.94);

  outColor = vec4(color * shape * uFade, shape * uFade);
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
uniform float uFocus;
uniform float uAperture;
uniform float uSpan;
out float vSide;
out float vAlong;
out float vAlpha;
out float vDepth;
out float vHalfPx;
out float vBlurPx;

vec3 path(float t) {
  float u = 1.0 - t;
  vec3 p = u * u * u * uFrom + 3.0 * u * u * t * uBendFrom + 3.0 * u * t * t * uBendTo + t * t * t * uTo;
  float lift = pow(sin(3.14159 * t), 0.7);
  float s = uSeed * 6.0;
  vec3 curl = vec3(
    sin(t * 6.0 + uTime * 0.21 + s) * 0.12 + sin(t * 15.0 - uTime * 0.17 + s * 1.3) * 0.04,
    cos(t * 5.0 + uTime * 0.19 + s * 1.7) * 0.14 + sin(t * 12.0 + uTime * 0.15 + s) * 0.05,
    sin(t * 8.0 - uTime * 0.16 + s * 0.6) * 0.09
  );
  float late = t * t;
  vec3 eddy = vec3(sin(t * 26.0 - uTime * 0.35 + s), cos(t * 26.0 - uTime * 0.35 + s), 0.0) * 0.05 * late;
  return p + curl * lift + eddy * lift;
}

void main() {
  float t = aStrand.x;
  vec4 view = uView * vec4(path(t), 1.0);
  vec4 here = uProjection * view;
  vec4 ahead = uProjection * uView * vec4(path(min(t + 0.01, 1.0)), 1.0);
  vec4 back = uProjection * uView * vec4(path(max(t - 0.01, 0.0)), 1.0);
  vec2 direction = (ahead.xy / ahead.w - back.xy / back.w) * uResolution;
  vec2 normal = normalize(vec2(-direction.y, direction.x) + 1e-5);

  float depth = max(-view.z, 0.05);
  float pixelsPerUnit = uResolution.y / (depth * uSpan);
  float blurPx = uAperture * abs(1.0 - uFocus / depth) * (depth < uFocus ? 1.0 : 0.57) * uResolution.y * 0.5;
  float swell = 0.55 + 0.45 * sin(t * 5.0 - uTime * 0.13 + uSeed * 9.0);
  float spread = uWidth * (0.2 + 1.1 * pow(t, 1.3)) * pow(sin(3.14159 * min(t * 1.1, 1.0)) + 0.15, 0.5) * swell;
  float halfPx = spread * pixelsPerUnit + blurPx * 0.45 + 1.5;

  vSide = aStrand.y;
  vAlong = t;
  vDepth = depth;
  vHalfPx = halfPx;
  vBlurPx = blurPx * 0.45;
  vAlpha = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.88, 1.0, t));
  vAlpha *= smoothstep(0.5, 1.4, depth) * (1.0 - smoothstep(14.0, 22.0, depth));

  here.xy += normal * aStrand.y * halfPx / uResolution * 2.0 * here.w;
  gl_Position = here;
}
`;

// A wisp is a ribbon holding a few braided filaments plus a faint smoky haze between them.
export const wispFragment = /* glsl */ `#version 300 es
${shared}
uniform float uStrength;
uniform float uSeed;
in float vSide;
in float vAlong;
in float vAlpha;
in float vDepth;
in float vHalfPx;
in float vBlurPx;
out vec4 outColor;
void main() {
  float px = vSide * vHalfPx;
  float s = uSeed * 17.0;
  float ink = 0.0;
  float room = vHalfPx - vBlurPx - 1.5;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float wander = sin(vAlong * (5.0 + fk * 2.3) + uTime * (0.11 + fk * 0.025) + s + fk * 2.4);
    wander += 0.6 * sin(vAlong * (13.0 + fk * 4.1) - uTime * 0.09 + fk * 1.3 + s * 0.7);
    wander *= 0.35 + 0.65 * (0.5 + 0.5 * sin(vAlong * 3.0 + fk * 1.9 + s));
    float offset = wander * 0.6 * room;
    float line = 0.45 + 0.5 * (0.5 + 0.5 * sin(vAlong * (17.0 + fk * 3.0) + fk * 5.1 + s - uTime * 0.2));
    float breakup = smoothstep(-0.6, 0.5, sin(vAlong * (4.0 + fk * 2.3) + fk * 3.7 + s * 1.9 - uTime * 0.12));
    float width = line + vBlurPx;
    float d = abs(px - offset);
    float strand = 1.0 - smoothstep(width - 0.5, width + 0.5, d);
    float tone = (0.7 + 0.3 * sin(vAlong * 9.0 + fk * 2.2 + s)) * (1.0 - fk * 0.1);
    ink = max(ink, strand * breakup * tone * min(1.0, (line + 0.6) / width));
  }
  float across = 1.0 - smoothstep(0.0, 1.0, abs(vSide));
  float haze = across * across * 0.06 * smoothstep(0.2, 1.0, sin(vAlong * 6.0 + s - uTime * 0.15));
  float alpha = clamp(ink * 0.92 + haze, 0.0, 1.0) * vAlpha * uStrength;
  vec3 color = mix(INK, water(gl_FragCoord.xy / uResolution), fogFor(vDepth) * 0.9);
  outColor = vec4(color * alpha, alpha);
}
`;
