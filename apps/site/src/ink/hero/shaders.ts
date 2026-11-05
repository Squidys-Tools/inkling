export const vertex = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const header = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
`;

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
    p = p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum;
}
vec2 curlNoise(vec2 p) {
  const float e = 0.01;
  float dx = fbm(p + vec2(e, 0.0)) - fbm(p - vec2(e, 0.0));
  float dy = fbm(p + vec2(0.0, e)) - fbm(p - vec2(0.0, e));
  return vec2(dy, -dx) / (2.0 * e);
}
`;

export const advect = `${header}
uniform sampler2D velocity;
uniform sampler2D source;
uniform vec2 texel;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 back = vUv - dt * texture(velocity, vUv).xy * texel;
  outColor = texture(source, back) / (1.0 + dissipation * dt);
}`;

export const curl = `${header}
uniform sampler2D velocity;
uniform vec2 texel;
void main() {
  float l = texture(velocity, vUv - vec2(texel.x, 0.0)).y;
  float r = texture(velocity, vUv + vec2(texel.x, 0.0)).y;
  float b = texture(velocity, vUv - vec2(0.0, texel.y)).x;
  float t = texture(velocity, vUv + vec2(0.0, texel.y)).x;
  outColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}`;

// Vorticity confinement keeps the small eddies alive, the curl-noise field keeps the cloud
// drifting, and a soft pull toward the anchor stops it wandering off the page.
export const force = `${header}
uniform sampler2D velocity;
uniform sampler2D curl;
uniform vec2 texel;
uniform vec2 anchor;
uniform float aspect;
uniform float time;
uniform float dt;
uniform float confinement;
uniform float drift;
${noise}
void main() {
  float l = abs(texture(curl, vUv - vec2(texel.x, 0.0)).x);
  float r = abs(texture(curl, vUv + vec2(texel.x, 0.0)).x);
  float b = abs(texture(curl, vUv - vec2(0.0, texel.y)).x);
  float t = abs(texture(curl, vUv + vec2(0.0, texel.y)).x);
  float c = texture(curl, vUv).x;
  vec2 grad = 0.5 * vec2(r - l, t - b);
  vec2 n = grad / (length(grad) + 1e-5);
  vec2 vort = confinement * c * vec2(n.y, -n.x);

  vec2 p = vec2(vUv.x * aspect, vUv.y);
  vec2 field = curlNoise(p * 1.8 + vec2(0.0, time * 0.035)) * 0.7
    + curlNoise(p * 4.0 - vec2(time * 0.05, 0.0)) * 0.12;
  vec2 offset = (vUv - anchor) * vec2(aspect, 1.0);
  float near = exp(-dot(offset, offset) * 6.0);
  vec2 pull = -offset * 18.0 * smoothstep(0.18, 0.5, length(offset));

  vec2 v = texture(velocity, vUv).xy;
  v += dt * (vort + field * drift * (0.35 + near) + pull);
  outColor = vec4(v, 0.0, 1.0);
}`;

export const divergence = `${header}
uniform sampler2D velocity;
uniform vec2 texel;
void main() {
  vec2 c = texture(velocity, vUv).xy;
  float l = texture(velocity, vUv - vec2(texel.x, 0.0)).x;
  float r = texture(velocity, vUv + vec2(texel.x, 0.0)).x;
  float b = texture(velocity, vUv - vec2(0.0, texel.y)).y;
  float t = texture(velocity, vUv + vec2(0.0, texel.y)).y;
  if (vUv.x - texel.x < 0.0) l = -c.x;
  if (vUv.x + texel.x > 1.0) r = -c.x;
  if (vUv.y - texel.y < 0.0) b = -c.y;
  if (vUv.y + texel.y > 1.0) t = -c.y;
  outColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}`;

export const pressure = `${header}
uniform sampler2D pressure;
uniform sampler2D divergence;
uniform vec2 texel;
void main() {
  float l = texture(pressure, vUv - vec2(texel.x, 0.0)).x;
  float r = texture(pressure, vUv + vec2(texel.x, 0.0)).x;
  float b = texture(pressure, vUv - vec2(0.0, texel.y)).x;
  float t = texture(pressure, vUv + vec2(0.0, texel.y)).x;
  float d = texture(divergence, vUv).x;
  outColor = vec4((l + r + b + t - d) * 0.25, 0.0, 0.0, 1.0);
}`;

export const project = `${header}
uniform sampler2D pressure;
uniform sampler2D velocity;
uniform vec2 texel;
void main() {
  float l = texture(pressure, vUv - vec2(texel.x, 0.0)).x;
  float r = texture(pressure, vUv + vec2(texel.x, 0.0)).x;
  float b = texture(pressure, vUv - vec2(0.0, texel.y)).x;
  float t = texture(pressure, vUv + vec2(0.0, texel.y)).x;
  vec2 v = texture(velocity, vUv).xy - 0.5 * vec2(r - l, t - b);
  outColor = vec4(v, 0.0, 1.0);
}`;

export const scale = `${header}
uniform sampler2D source;
uniform float factor;
void main() {
  outColor = texture(source, vUv) * factor;
}`;

export const splat = `${header}
uniform sampler2D target;
uniform vec2 point;
uniform vec3 value;
uniform float radius;
uniform float aspect;
void main() {
  vec2 d = (vUv - point) * vec2(aspect, 1.0);
  float falloff = exp(-dot(d, d) / radius);
  outColor = vec4(texture(target, vUv).xyz + value * falloff, 1.0);
}`;

// The ink keeps being fed from a falling thread at the top and a slow, noise-shaped bloom
// at the anchor, so the cloud never thins out between visits.
export const feed = `${header}
uniform sampler2D dye;
uniform vec2 anchor;
uniform float aspect;
uniform float time;
uniform float dt;
uniform float rate;
${noise}
void main() {
  vec2 offset = (vUv - anchor) * vec2(aspect, 1.0);
  float bloom = 0.0;
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    vec2 drift = vec2(0.17 * sin(time * 0.13 + k * 2.1), 0.1 * cos(time * 0.17 + k * 1.7));
    vec2 o = offset - drift;
    bloom += exp(-dot(o, o) / 0.009) * (0.55 + 0.45 * sin(time * 0.37 + k * 2.3));
  }
  float sway = 0.04 * sin(time * 0.21) + 0.02 * gnoise(vec2(vUv.y * 4.0, time * 0.1));
  float thread = smoothstep(0.014, 0.0, abs(offset.x - sway)) * smoothstep(anchor.y + 0.08, 1.0, vUv.y);
  float d = texture(dye, vUv).x;
  float amount = rate * dt * (bloom + thread * 0.3);
  outColor = vec4(min(d + amount * (1.0 - d * 0.35), 3.0), 0.0, 0.0, 1.0);
}`;

export const thread = `${header}
uniform sampler2D velocity;
uniform vec2 anchor;
uniform float aspect;
uniform float time;
uniform float dt;
${noise}
void main() {
  vec2 v = texture(velocity, vUv).xy;
  vec2 offset = (vUv - anchor) * vec2(aspect, 1.0);
  float sway = 0.04 * sin(time * 0.21) + 0.02 * gnoise(vec2(vUv.y * 4.0, time * 0.1));
  float column = smoothstep(0.03, 0.0, abs(offset.x - sway)) * smoothstep(anchor.y, 1.0, vUv.y);
  v.y -= dt * column * 40.0;
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    vec2 drift = vec2(0.17 * sin(time * 0.13 + k * 2.1), 0.1 * cos(time * 0.17 + k * 1.7));
    vec2 o = offset - drift;
    float pulse = max(0.0, sin(time * 0.37 + k * 2.3));
    v += dt * normalize(o + 1e-4) * exp(-dot(o, o) / 0.02) * pulse * 90.0;
  }
  outColor = vec4(v, 0.0, 1.0);
}`;

export const display = `${header}
uniform sampler2D dye;
uniform vec2 texel;
uniform float aspect;
uniform float time;
uniform vec3 water;
uniform vec3 ink;
${noise}
float density(vec2 uv) {
  return texture(dye, uv).x;
}
float caustic(vec2 p, float t) {
  vec2 q = p;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    q += 0.55 * vec2(sin(q.y * 1.6 + t * 0.55), cos(q.x * 1.35 - t * 0.45));
    c += 1.0 / (1.0 + 34.0 * abs(sin(q.x) + sin(q.y)));
  }
  return c / 3.0;
}
void main() {
  vec2 uv = vUv;
  float d = density(uv);
  float dl = density(uv - vec2(texel.x * 3.0, 0.0));
  float dr = density(uv + vec2(texel.x * 3.0, 0.0));
  float db = density(uv - vec2(0.0, texel.y * 3.0));
  float dt = density(uv + vec2(0.0, texel.y * 3.0));
  vec2 grad = vec2(dr - dl, dt - db);

  vec2 p = vec2(uv.x * aspect, uv.y);
  float light = caustic(p * 7.0 + grad * 6.0, time * 0.6);
  float shade = 0.0;
  for (int i = 1; i <= 4; i++) {
    float k = float(i);
    shade += density(uv + vec2(0.012 * k, -0.03 * k));
  }
  shade = 1.0 - exp(-shade * 0.08);

  vec2 centered = (uv - vec2(0.5, 0.56)) * vec2(aspect, 1.0);
  float glow = smoothstep(1.2, 0.0, length(centered));
  vec3 base = water * (0.975 + 0.035 * glow);
  base += vec3(0.022, 0.024, 0.026) * light * (1.0 - shade);
  base *= 1.0 - 0.07 * shade;

  float thick = 1.0 - exp(-d * 4.5);
  vec3 normal = normalize(vec3(-grad * 1.6, 0.6));
  float rim = pow(clamp(dot(normal, normalize(vec3(-0.4, 0.7, 0.6))), 0.0, 1.0), 3.0);
  float veil = smoothstep(0.0, 0.5, thick) * (1.0 - smoothstep(0.55, 1.0, thick));
  vec3 smoke = mix(ink, vec3(0.32, 0.33, 0.34), 0.55 * veil);
  smoke += vec3(0.16) * rim * smoothstep(0.35, 0.9, thick);
  vec3 color = mix(base, smoke, thick);

  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  outColor = vec4(color + grain / 255.0, 1.0);
}`;
