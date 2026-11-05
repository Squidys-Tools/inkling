export const MAX_RIPPLES = 6;

export const quadVertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Composites the splash plate over the clean water plate in plate pixels (1376x768).
// Each layer adds only its masked difference from the clean plate (mask in clean's alpha), so warping or scaling a
// layer moves the ink and the crown without dragging the water's own lines with it.
export const composite = `#version 300 es
precision highp float;
uniform sampler2D plate;
uniform sampler2D clean;
uniform vec2 resolution;
uniform vec3 frame;
uniform float age;
uniform float clock;
uniform float motion;
uniform float lod;
uniform int count;
uniform vec4 ripples[${MAX_RIPPLES}];
out vec4 outColor;

const vec2 PLATE = vec2(1376.0, 768.0);
const vec2 CROWN = vec2(902.0, 362.0);
const float FRONT = 404.0;
const float MIRROR = 642.0;
const float PLUME_END = 648.0;
const vec3 INK = vec3(0.04, 0.04, 0.045);

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
float fbm(vec3 p) {
  return gnoise(p) + 0.5 * gnoise(p * 2.03 + 11.0) + 0.25 * gnoise(p * 4.11 + 23.0);
}
float hash(float n) { return fract(sin(n) * 43758.5453); }

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
float darkness(vec3 c) { return smoothstep(0.035, 0.14, -dot(c, vec3(0.333))); }

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

void main() {
  vec2 frag = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
  vec2 p = (frag - frame.yz) / frame.x;
  float shimmer = motion * 0.35 * gnoise(vec3(p.x * 0.01, p.y * 0.08, clock * 0.25));
  float band = smoothstep(300.0, 320.0, p.y) * (1.0 - smoothstep(396.0, 412.0, p.y));
  vec2 wp = p + vec2(0.0, rings(p) + shimmer * band);
  vec3 color = sampleAt(clean, clamp(wp, vec2(0.5), PLATE - 0.5));
  float on = inside(p);

  // A blurred read of the mask gates the costly layers to the neighbourhood of the splash.
  float near = textureLod(clean, wp / PLATE, lod + 4.0).a;
  if (on > 0.0 && age > 0.0 && near > 0.001) {
    // Crown: rises out of the surface and spreads, throwing its droplets last.
    float rise = easeBack(age / 0.85);
    float spread = mix(0.42, 1.0, easeOut(age / 0.7));
    if (wp.y < FRONT) {
      vec2 q = wp;
      q.x = CROWN.x + (q.x - CROWN.x) / spread;
      if (q.y < CROWN.y) q.y = CROWN.y + (q.y - CROWN.y) / max(rise, 0.04);
      float spray = smoothstep(196.0, 176.0, q.y);
      float a = smoothstep(0.0, 0.12, age) * mix(1.0, smoothstep(0.35, 0.8, age), spray);
      float life = motion * (1.0 - spray) * smoothstep(250.0, 330.0, q.y);
      q += life * 0.6 * vec2(gnoise(vec3(q * 0.05, clock * 0.6)), gnoise(vec3(q * 0.05 + 9.0, clock * 0.6)));
      color += layer(q) * a * inside(q);
    }

    // Plume: the ink blooms down from the crown, its warped tendrils settling into the
    // photographed shape; the water lines around it fade in unwarped.
    if (wp.y >= FRONT && wp.y < MIRROR && abs(wp.x - CROWN.x) < 340.0) {
      float grow = easeOut((age - 0.12) / 3.2);
      vec3 s = vec3(wp * 0.011, clock * 0.045 * motion);
      vec2 warp = vec2(fbm(s), fbm(s + vec3(5.2, 1.3, 0.0)));
      warp = vec2(fbm(s + vec3(warp * 1.6, 0.0)), fbm(s + vec3(warp * 1.6 + 3.7, 0.0)));
      float amp = (mix(30.0, 0.0, grow) + motion * 2.2) * smoothstep(FRONT, FRONT + 36.0, wp.y);
      vec2 q = wp + warp * amp;
      q.x = CROWN.x + (q.x - CROWN.x) / mix(0.55, 1.0, grow);
      float lace = 0.25 * fbm(vec3(q * 0.03, 2.0));
      float edge = grow * 1.3 - (q.y - FRONT) / (PLUME_END - FRONT) + lace;
      vec3 still = layer(wp);
      float settled = grow * 1.3 - (wp.y - FRONT) / (PLUME_END - FRONT) + lace;
      color += still * (1.0 - darkness(still)) * smoothstep(0.0, 0.12, settled);
      vec3 ink = layer(q) * inside(q);
      float dark = darkness(ink);
      ink = mix(ink, INK - sampleAt(clean, q), dark * 0.1);
      color += ink * dark * smoothstep(0.0, 0.12, edge);
    }

    // The mirrored crown on the lower interface follows the crown's rise, a beat late.
    if (wp.y >= MIRROR) {
      float r = easeBack((age - 0.9) / 0.9);
      vec2 q = wp;
      q.x = CROWN.x + (q.x - CROWN.x) / mix(0.42, 1.0, easeOut((age - 0.85) / 0.8));
      q.y = MIRROR + (q.y - MIRROR) / max(r, 0.04);
      float a = smoothstep(0.9, 1.5, age);
      color += layer(q) * a * inside(q);
    }
  }

  if (age < 0.0) {
    // The falling drop: a dark bead, stretched by its speed, lit from the upper left.
    float fall = -age;
    vec2 at = vec2(CROWN.x, CROWN.y - 1300.0 * fall * fall);
    vec2 d = (p - at) / vec2(13.0, 13.0 * (1.0 + min(fall * 0.8, 0.35)));
    float r = length(d);
    if (r < 1.0) {
      vec3 n = vec3(d, sqrt(1.0 - r * r));
      float spec = pow(max(0.0, dot(n, normalize(vec3(-0.45, -0.6, 0.65)))), 36.0);
      vec3 c = INK * (0.65 + 0.35 * n.z) + spec * 0.85;
      color = mix(color, c, smoothstep(1.0, 0.86, r));
    }
  }

  float grain = hash(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + clock) - 0.5;
  outColor = vec4(color + grain * 0.008 * motion, 1.0);
}`;
