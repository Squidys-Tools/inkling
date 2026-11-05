export const MAX_RIPPLES = 6;
export const MAX_JETS = 8;
export const MAX_BEADS = 6;

export const quadVertex = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const noise = `
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
float hash(float n) { return fract(sin(n) * 43758.5453); }`;

// The sim lives in a box of plate pixels under the surface (domain = x, y, width, height; y down),
// with uv y up. Velocities are plate pixels per second.
const domain = `
uniform vec4 domain;
vec2 plateAt(vec2 uv) { return vec2(domain.x + uv.x * domain.z, domain.y + (1.0 - uv.y) * domain.w); }
// The guide covers only the moodboard plume; outside it the target reads zero.
uniform sampler2D target;
uniform vec4 guideBox;
float guideAt(vec2 p, float lod) {
  vec2 t = (p - guideBox.xy) / guideBox.zw;
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return 0.0;
  return textureLod(target, vec2(t.x, 1.0 - t.y), lod).r;
}`;

export const copyStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D source;
out vec4 outColor;
void main() { outColor = texture(source, vUv); }`;

// Seeds the dye with the guide itself: the reduced-motion still, no warm-up steps.
export const seedStep = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
${domain}
void main() { outColor = vec4(guideAt(plateAt(vUv), 0.0), 0.0, 0.0, 1.0); }`;

export const curlStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D velocity;
uniform vec2 texel;
uniform vec2 cell;
out vec4 outColor;
void main() {
  float l = texture(velocity, vUv - vec2(texel.x, 0.0)).y;
  float r = texture(velocity, vUv + vec2(texel.x, 0.0)).y;
  float b = texture(velocity, vUv - vec2(0.0, texel.y)).x;
  float t = texture(velocity, vUv + vec2(0.0, texel.y)).x;
  outColor = vec4((r - l) / (2.0 * cell.x) - (t - b) / (2.0 * cell.y), 0.0, 0.0, 1.0);
}`;

// Vorticity confinement, the ink's weight, a pull back toward the plume's silhouette,
// slow curl noise so it never settles, and the jets that drops and the stem push in.
export const forceStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D velocity;
uniform sampler2D curl;
uniform sampler2D dye;
uniform vec2 texel;
uniform vec2 cell;
uniform float dt;
uniform float time;
uniform vec4 forces;
uniform int jetCount;
uniform vec4 jets[${MAX_JETS}];
out vec4 outColor;
${noise}
${domain}
vec2 curlNoise(vec2 p, float t) {
  float e = 0.35;
  float n1 = gnoise(vec3(p.x, p.y + e, t)) + 0.5 * gnoise(vec3(p * 2.1 + vec2(0.0, e * 2.1), t * 1.6 + 7.0));
  float n2 = gnoise(vec3(p.x, p.y - e, t)) + 0.5 * gnoise(vec3(p * 2.1 - vec2(0.0, e * 2.1), t * 1.6 + 7.0));
  float n3 = gnoise(vec3(p.x + e, p.y, t)) + 0.5 * gnoise(vec3(p * 2.1 + vec2(e * 2.1, 0.0), t * 1.6 + 7.0));
  float n4 = gnoise(vec3(p.x - e, p.y, t)) + 0.5 * gnoise(vec3(p * 2.1 - vec2(e * 2.1, 0.0), t * 1.6 + 7.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}
void main() {
  vec2 v = texture(velocity, vUv).xy;
  float c = texture(curl, vUv).x;
  float cl = abs(texture(curl, vUv - vec2(texel.x, 0.0)).x);
  float cr = abs(texture(curl, vUv + vec2(texel.x, 0.0)).x);
  float cb = abs(texture(curl, vUv - vec2(0.0, texel.y)).x);
  float ct = abs(texture(curl, vUv + vec2(0.0, texel.y)).x);
  vec2 n = vec2(cr - cl, ct - cb);
  n /= length(n) + 1e-4;
  vec2 f = forces.x * cell.x * c * vec2(n.y, -n.x);

  vec2 p = plateAt(vUv);
  vec2 d = texture(dye, vUv).rg;
  float ink = min(d.r + d.g, 1.5);
  f.y -= forces.y * ink;

  float e = 10.0;
  float gx = guideAt(p + vec2(e, 0.0), 3.0) - guideAt(p - vec2(e, 0.0), 3.0);
  float gy = guideAt(p - vec2(0.0, e), 3.0) - guideAt(p + vec2(0.0, e), 3.0);
  float g = guideAt(p, 3.0);
  f += forces.z * vec2(gx, gy) * min(d.r, 1.0) * (1.0 - g);

  f += forces.w * curlNoise(p * 0.016, time * 0.3) * smoothstep(0.0, 0.25, ink + 0.5 * g);

  v += f * dt;
  for (int i = 0; i < ${MAX_JETS}; i++) {
    if (i >= jetCount) break;
    vec4 j = jets[i];
    vec2 q = (p - j.xy) / vec2(j.w, j.w * 1.6);
    float w = exp(-dot(q, q));
    v = mix(v, vec2(0.0, -j.z), clamp(w * dt * 14.0, 0.0, 1.0));
  }
  v *= exp(-dt * 0.9);
  float speed = length(v);
  if (speed > 420.0) v *= 420.0 / speed;
  outColor = vec4(v, 0.0, 1.0);
}`;

export const divergenceStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D velocity;
uniform vec2 texel;
uniform vec2 cell;
out vec4 outColor;
void main() {
  // Walls: the velocity beyond the box mirrors to zero normal flow.
  vec2 c = texture(velocity, vUv).xy;
  float l = vUv.x - texel.x < 0.0 ? -c.x : texture(velocity, vUv - vec2(texel.x, 0.0)).x;
  float r = vUv.x + texel.x > 1.0 ? -c.x : texture(velocity, vUv + vec2(texel.x, 0.0)).x;
  float b = vUv.y - texel.y < 0.0 ? -c.y : texture(velocity, vUv - vec2(0.0, texel.y)).y;
  float t = vUv.y + texel.y > 1.0 ? -c.y : texture(velocity, vUv + vec2(0.0, texel.y)).y;
  outColor = vec4((r - l) / (2.0 * cell.x) + (t - b) / (2.0 * cell.y), 0.0, 0.0, 1.0);
}`;

export const pressureStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D pressure;
uniform sampler2D divergence;
uniform vec2 texel;
uniform vec2 cell;
out vec4 outColor;
void main() {
  float l = texture(pressure, vUv - vec2(texel.x, 0.0)).x;
  float r = texture(pressure, vUv + vec2(texel.x, 0.0)).x;
  float b = texture(pressure, vUv - vec2(0.0, texel.y)).x;
  float t = texture(pressure, vUv + vec2(0.0, texel.y)).x;
  float div = texture(divergence, vUv).x;
  float ax = 1.0 / (cell.x * cell.x);
  float ay = 1.0 / (cell.y * cell.y);
  outColor = vec4(((l + r) * ax + (b + t) * ay - div) / (2.0 * (ax + ay)), 0.0, 0.0, 1.0);
}`;

export const projectStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D velocity;
uniform sampler2D pressure;
uniform vec2 texel;
uniform vec2 cell;
out vec4 outColor;
void main() {
  float l = texture(pressure, vUv - vec2(texel.x, 0.0)).x;
  float r = texture(pressure, vUv + vec2(texel.x, 0.0)).x;
  float b = texture(pressure, vUv - vec2(0.0, texel.y)).x;
  float t = texture(pressure, vUv + vec2(0.0, texel.y)).x;
  vec2 v = texture(velocity, vUv).xy - vec2((r - l) / (2.0 * cell.x), (t - b) / (2.0 * cell.y));
  outColor = vec4(v, 0.0, 1.0);
}`;

export const advectVelocityStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D velocity;
uniform float dt;
out vec4 outColor;
${domain}
void main() {
  vec2 v = texture(velocity, vUv).xy;
  vec2 back = vUv - dt * v / domain.zw;
  vec2 edge = smoothstep(0.0, 0.02, vUv) * smoothstep(0.0, 0.02, 1.0 - vUv);
  outColor = vec4(texture(velocity, back).xy * edge.x * edge.y, 0.0, 1.0);
}`;

// MacCormack, first half: the plain semi-Lagrangian step.
export const advectDyeStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D velocity;
uniform sampler2D dye;
uniform float dt;
out vec4 outColor;
${domain}
void main() {
  vec2 v = texture(velocity, vUv).xy;
  outColor = texture(dye, vUv - dt * v / domain.zw);
}`;

// MacCormack correction, clamped to the departure cell so it cannot ring, then the guide:
// red is the splash's ink, which fills toward the moodboard plume behind a front that sinks
// with grow and only slowly lets go of what swirls outside it; green is ink the reader drops.
export const dyeStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D velocity;
uniform sampler2D dye;
uniform sampler2D forward;
uniform vec2 dyeTexel;
uniform float dt;
uniform float time;
uniform vec4 guide;
uniform int jetCount;
uniform vec4 jets[${MAX_JETS}];
uniform vec4 feeds[${MAX_JETS}];
out vec4 outColor;
${noise}
${domain}
void main() {
  vec2 v = dt * texture(velocity, vUv).xy / domain.zw;
  vec4 hat = texture(forward, vUv);
  vec4 back = texture(forward, vUv + v);
  vec4 d = hat + 0.5 * (texture(dye, vUv) - back);
  vec2 st = (vUv - v) / dyeTexel - 0.5;
  vec2 base = (floor(st) + 0.5) * dyeTexel;
  vec4 a = texture(dye, base);
  vec4 b = texture(dye, base + vec2(dyeTexel.x, 0.0));
  vec4 c = texture(dye, base + vec2(0.0, dyeTexel.y));
  vec4 e = texture(dye, base + dyeTexel);
  d = clamp(d, min(min(a, b), min(c, e)), max(max(a, b), max(c, e)));

  vec2 p = plateAt(vUv);
  float t = guideAt(p, 0.0);
  float depth = (p.y - 404.0) / 244.0;
  float lace = 0.22 * gnoise(vec3(p * 0.03, 3.0)) + 0.08 * gnoise(vec3(p * 0.1, time * 0.2));
  float open = smoothstep(0.0, 0.18, guide.x * 1.3 - depth + lace);
  // Fill grows only out of ink that is already near, so the plume creeps out along the
  // moodboard's tendrils from wherever the flow has carried ink, rather than fading in.
  vec2 o = dyeTexel * 6.0;
  float near = max(
    max(texture(dye, vUv + vec2(o.x, 0.0)).r, texture(dye, vUv - vec2(o.x, 0.0)).r),
    max(texture(dye, vUv + vec2(0.0, o.y)).r, texture(dye, vUv - vec2(0.0, o.y)).r));
  near = max(near, 0.7 * max(
    max(texture(dye, vUv + 1.6 * o).r, texture(dye, vUv - 1.6 * o).r),
    max(texture(dye, vUv + 1.6 * vec2(o.x, -o.y)).r, texture(dye, vUv - 1.6 * vec2(o.x, -o.y)).r)));
  float k = t > d.r ? guide.y * (0.02 + smoothstep(0.03, 0.3, max(near, d.r))) : guide.z;
  d.r += (t - d.r) * clamp(k * open * dt, 0.0, 1.0);
  d.r *= exp(-dt * 0.03);
  d.g *= exp(-dt * guide.w);

  for (int i = 0; i < ${MAX_JETS}; i++) {
    if (i >= jetCount) break;
    vec4 j = jets[i];
    vec2 q = (p - j.xy) / vec2(j.w * 0.8, j.w * 1.4);
    float w = exp(-dot(q, q)) * (0.7 + 0.6 * gnoise(vec3(p * 0.25, time * 3.0)));
    d.rg += feeds[i].xy * w * dt;
  }
  vec2 edge = smoothstep(0.0, 0.01, vUv) * smoothstep(0.0, 0.01, 1.0 - vUv);
  outColor = vec4(clamp(d.rg, 0.0, 3.0) * edge.x * edge.y, 0.0, 1.0);
}`;

// Composites in plate pixels (1376x768): the clean water plate, the live ink from the sim,
// and the moodboard's crown, which rises and spreads out of the plate (each plate layer adds
// only its masked difference from the clean plate, mask in clean's alpha).
export const composite = `#version 300 es
precision highp float;
uniform sampler2D plate;
uniform sampler2D clean;
uniform sampler2D dyeNow;
uniform sampler2D dyeBefore;
uniform vec2 resolution;
uniform vec3 frame;
uniform vec4 domain;
uniform vec2 dyeTexel;
uniform float blend;
uniform float age;
uniform float clock;
uniform float motion;
uniform float lod;
uniform int count;
uniform vec4 ripples[${MAX_RIPPLES}];
uniform int beadCount;
uniform vec4 beads[${MAX_BEADS}];
out vec4 outColor;
${noise}

const vec2 PLATE = vec2(1376.0, 768.0);
const vec2 CROWN = vec2(902.0, 362.0);
const float FRONT = 404.0;
const float MIRROR = 642.0;
const vec3 INK = vec3(0.035, 0.032, 0.033);
const vec3 THIN = vec3(0.34, 0.27, 0.2);

// Explicit LOD: implicit derivatives are undefined across the layer branches below and
// draw seams along every branch edge.
vec3 sampleAt(sampler2D t, vec2 p) { return textureLod(t, p / PLATE, lod).rgb; }
vec3 layer(vec2 p) {
  vec4 c = textureLod(clean, p / PLATE, lod);
  return (sampleAt(plate, p) - c.rgb) * c.a;
}
float inside(vec2 p) {
  vec2 e = min(p, PLATE - p);
  return step(0.0, min(e.x, e.y));
}

float easeOut(float x) { x = 1.0 - clamp(x, 0.0, 1.0); return 1.0 - x * x * x; }
// pow() is undefined for a negative base, so the overshoot is written out.
float easeBack(float x) {
  x = clamp(x, 0.0, 1.0) - 1.0;
  return 1.0 + 2.4 * x * x * x + 1.4 * x * x;
}

// Rings on the surface band, squashed by perspective; returns a vertical sampling offset.
float rings(vec2 p) {
  float band = smoothstep(296.0, 318.0, p.y) * (1.0 - smoothstep(398.0, 412.0, p.y));
  if (band <= 0.0) return 0.0;
  float h = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= count) break;
    vec4 r = ripples[i];
    float t = clock - r.y;
    if (t < 0.0 || t > 6.0) continue;
    float d = length((p - vec2(r.x, CROWN.y + 8.0)) * vec2(1.0, 4.2));
    float front = r.w + 210.0 * t;
    float w = exp(-pow((d - front) / 90.0, 2.0));
    h += r.z * w * sin(d * 0.085 - t * 9.0) * exp(-t * 0.65);
  }
  return h * band;
}

float dyeAt(sampler2D t, vec2 uv) { vec2 d = texture(t, uv).rg; return d.r + d.g; }

vec3 bead(vec3 color, vec2 p, vec2 at, float fall, float size) {
  vec2 d = (p - at) / vec2(size, size * (1.0 + min(fall * 0.8, 0.35)));
  float r = length(d);
  if (r >= 1.0) return color;
  vec3 n = vec3(d, sqrt(1.0 - r * r));
  float spec = pow(max(0.0, dot(n, normalize(vec3(-0.45, -0.6, 0.65)))), 36.0);
  vec3 c = INK * (0.65 + 0.35 * n.z) + spec * 0.85;
  return mix(color, c, smoothstep(1.0, 0.86, r));
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
  vec2 p = (frag - frame.yz) / frame.x;
  float shimmer = motion * 0.35 * gnoise(vec3(p.x * 0.01, p.y * 0.08, clock * 0.25));
  float band = smoothstep(300.0, 320.0, p.y) * (1.0 - smoothstep(396.0, 412.0, p.y));
  vec2 wp = p + vec2(0.0, rings(p) + shimmer * band);
  vec3 color = sampleAt(clean, clamp(wp, vec2(0.5), PLATE - 0.5));
  float on = inside(p);

  // Live ink: the dye, interpolated between the last two 30Hz steps, wobbled by fine noise
  // and sharpened against its blur so the upscaled sim keeps crisp tendril edges.
  vec2 duv = vec2((wp.x - domain.x) / domain.z, 1.0 - (wp.y - domain.y) / domain.w);
  if (on > 0.0 && duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) {
    vec3 s = vec3(wp * 0.09, clock * 0.5);
    vec2 jitter = vec2(gnoise(s), gnoise(s + 17.0)) * 1.4 * motion / domain.zw;
    vec2 uv = duv + jitter;
    float d = mix(dyeAt(dyeBefore, uv), dyeAt(dyeNow, uv), blend);
    if (d > 0.002) {
      vec2 o = dyeTexel * 1.2;
      float soft = 0.25 * (dyeAt(dyeNow, uv + vec2(o.x, 0.0)) + dyeAt(dyeNow, uv - vec2(o.x, 0.0))
        + dyeAt(dyeNow, uv + vec2(0.0, o.y)) + dyeAt(dyeNow, uv - vec2(0.0, o.y)));
      d = max(0.0, d + 1.0 * (d - soft));
      float a = 1.0 - exp(-5.0 * pow(d, 1.6));
      vec3 ink = mix(THIN, INK, smoothstep(0.55, 1.0, a));
      float fade = smoothstep(0.0, 0.015, duv.y) * smoothstep(0.0, 0.01, 1.0 - duv.y);
      color = mix(color, ink, a * fade);
    }
  }

  // A blurred read of the mask gates the plate layers to the neighbourhood of the splash.
  float near = textureLod(clean, wp / PLATE, lod + 4.0).a;
  if (on > 0.0 && age > 0.0 && near > 0.001) {
    // Crown: rises out of the surface and spreads, throwing its droplets last, then sways.
    float rise = easeBack(age / 0.85);
    float spread = mix(0.42, 1.0, easeOut(age / 0.7));
    if (wp.y < FRONT) {
      vec2 q = wp;
      float breathe = 1.0 + motion * 0.012 * sin(clock * 1.7) * smoothstep(1.2, 2.0, age);
      q.x = CROWN.x + (q.x - CROWN.x) / (spread * breathe);
      if (q.y < CROWN.y) q.y = CROWN.y + (q.y - CROWN.y) / max(rise * breathe, 0.04);
      float spray = smoothstep(196.0, 176.0, q.y);
      float a = smoothstep(0.0, 0.12, age) * mix(1.0, smoothstep(0.35, 0.8, age), spray);
      float life = motion * (1.0 - spray) * smoothstep(250.0, 330.0, q.y);
      q += life * 0.9 * vec2(gnoise(vec3(q * 0.05, clock * 0.6)), gnoise(vec3(q * 0.05 + 9.0, clock * 0.6)));
      color += layer(q) * a * inside(q);
    }

    // The mirrored crown on the lower interface follows the crown's rise, a beat late.
    if (wp.y >= MIRROR) {
      float r = easeBack((age - 0.9) / 0.9);
      vec2 q = wp;
      q.x = CROWN.x + (q.x - CROWN.x) / mix(0.42, 1.0, easeOut((age - 0.85) / 0.8));
      q.y = MIRROR + (q.y - MIRROR) / max(r, 0.04);
      q += motion * 0.7 * vec2(gnoise(vec3(q * 0.05, clock * 0.5)), gnoise(vec3(q * 0.05 + 4.0, clock * 0.5)));
      float a = smoothstep(0.9, 1.5, age);
      color += layer(q) * a * inside(q);
    }
  }

  // Falling drops: the splash's own, and any the reader drops, stretched by their speed.
  if (age < 0.0) {
    float fall = -age;
    color = bead(color, p, vec2(CROWN.x, CROWN.y - 1300.0 * fall * fall), fall, 13.0);
  }
  for (int i = 0; i < ${MAX_BEADS}; i++) {
    if (i >= beadCount) break;
    vec4 b = beads[i];
    float fall = b.z - clock;
    if (fall <= 0.0) continue;
    color = bead(color, p, vec2(b.x, b.y - 1300.0 * fall * fall), fall, b.w);
  }

  float grain = hash(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + clock) - 0.5;
  outColor = vec4(color + grain * 0.008 * motion, 1.0);
}`;
