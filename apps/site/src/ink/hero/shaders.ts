export const vertex = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const header = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
`;

export const stirCount = 6;

const noise = `
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * gnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum;
}
vec2 curl(vec2 p) {
  const float e = 0.02;
  float c = fbm(p);
  float x = fbm(p + vec2(e, 0.0));
  float y = fbm(p + vec2(0.0, e));
  return vec2(y - c, c - x) / e;
}
`;

// Low-resolution flow field, rendered at a fraction of the canvas and every other frame.
// rg holds a displacement in units of the section's height, packed around 0.5.
export const flow = `${header}
uniform float aspect;
uniform float time;
uniform vec4 stirs[${stirCount}];
uniform vec2 pushes[${stirCount}];
${noise}
void main() {
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  float t = time;
  vec2 warp = vec2(fbm(p * 1.7 + vec2(0.0, t * 0.03)), fbm(p * 1.7 + vec2(5.2, 1.3) - t * 0.025));
  vec2 broad = curl(p * 1.25 + warp * 1.4 + vec2(t * 0.012, t * 0.035));
  vec2 fine = curl(p * 4.2 + warp * 2.2 - vec2(0.0, t * 0.07));
  vec2 d = broad * 0.0065 + fine * 0.0019;

  for (int i = 0; i < ${stirCount}; i++) {
    vec4 s = stirs[i];
    if (s.w <= 0.0) continue;
    vec2 o = (vUv - s.xy) * vec2(aspect, 1.0);
    float r2 = dot(o, o);
    float fall = exp(-r2 / s.z);
    float age = s.w;
    float shape = (1.0 - exp(-age * 7.0)) * exp(-age * 0.85);
    vec2 swirl = vec2(-o.y, o.x) / (sqrt(r2) + 0.02);
    d += (pushes[i] + swirl * length(pushes[i]) * 0.6) * fall * shape;
  }
  outColor = vec4(clamp(d * 6.0 + 0.5, 0.0, 1.0), 0.0, 1.0);
}`;

// The ink is a plate cut from the moodboard photograph. The flow bends it: dense cores barely
// breathe while thin veils and tendrils drift, and a faint bleed of the plate diffuses around them.
export const display = `${header}
uniform sampler2D plate;
uniform sampler2D flowField;
uniform vec4 plateRect;
uniform float aspect;
uniform float time;
uniform vec3 water;
uniform vec3 ink;
uniform vec3 veil;
${noise}
float density(vec2 screen, float lod) {
  vec2 uv = (screen - plateRect.xy) / plateRect.zw;
  uv.y = 1.0 - uv.y;
  // The plate's sides and bottom are clear water and its top row is the falling thread,
  // so clamping extends the thread past the top edge instead of cutting it.
  return textureLod(plate, clamp(uv, 0.0, 1.0), lod).a;
}
void main() {
  vec2 uv = vUv;
  vec2 d = (texture(flowField, uv).rg - 0.5) / 6.0;
  d.x /= aspect;

  float body = density(uv, 4.5);
  float freedom = mix(1.0, 0.28, smoothstep(0.35, 0.85, body));
  vec2 centre = plateRect.xy + plateRect.zw * vec2(0.5, 0.42);
  float breath = 0.012 * sin(time * 0.21) + 0.006 * sin(time * 0.37 + 1.3);
  vec2 rest = centre + (uv - centre) * (1.0 - breath);
  vec2 bent = rest + d * freedom;

  float a = density(bent, 0.0);
  float soft = density(bent, 1.6);
  a = clamp(a + 0.55 * (a - soft), 0.0, 1.0);
  float bleed = density(rest + d * 2.6 + vec2(0.0, 0.004 * sin(time * 0.3)), 2.6);
  float haze = max(0.0, bleed - soft) * 0.07;
  float cover = clamp(a + haze, 0.0, 1.0);

  vec2 centred = (uv - vec2(0.5, 0.55)) * vec2(aspect, 1.0);
  vec3 base = water * (1.012 - 0.03 * smoothstep(0.2, 1.3, length(centred)));
  vec3 tone = mix(veil, ink, smoothstep(0.25, 0.9, a));
  vec3 color = mix(base, tone, cover);

  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  outColor = vec4(color + grain / 255.0, 1.0);
}`;
