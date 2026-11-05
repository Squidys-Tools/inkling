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

export const splatCount = 8;
export const jetCount = 6;
export const swirlCount = 4;
export const dropCount = 6;

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
  for (int i = 0; i < 3; i++) {
    sum += amp * gnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum;
}
`;

// The guide: the moodboard ink's coverage, blurred, drawn once per resize into section space.
// r is a wide blur that pulls the cloud's silhouette, g a tighter one that says where to feed.
export const target = `${header}
uniform sampler2D plate;
uniform vec4 plateRect;
float cover(vec2 screen, float lod) {
  vec2 uv = (screen - plateRect.xy) / plateRect.zw;
  uv.y = 1.0 - uv.y;
  // The plate's top row is the falling thread, so it runs on past the top edge.
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * (1.0 - smoothstep(0.97, 1.0, uv.y));
  return textureLod(plate, clamp(uv, 0.0, 1.0), lod).a * inside;
}
void main() {
  float wide = 0.5 * (cover(vUv, 3.5) + cover(vUv, 5.0));
  float near = cover(vUv, 2.4);
  outColor = vec4(wide, near, 0.0, 1.0);
}`;

export const copy = `${header}
uniform sampler2D source;
void main() {
  outColor = texture(source, vUv);
}`;

// Up to eight pointer or keystroke stirs in one pass, each a gaussian push on the velocity.
export const splat = `${header}
uniform sampler2D source;
uniform float aspect;
uniform vec4 points[${splatCount}];
uniform vec3 values[${splatCount}];
void main() {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${splatCount}; i++) {
    vec4 s = points[i];
    if (s.z <= 0.0) continue;
    vec2 o = (vUv - s.xy) * vec2(aspect, 1.0);
    sum += values[i] * exp(-dot(o, o) / s.z);
  }
  outColor = texture(source, vUv) + vec4(sum, 0.0);
}`;

export const curl = `${header}
uniform sampler2D velocity;
uniform vec2 texel;
uniform float cell;
void main() {
  float l = texture(velocity, vUv - vec2(texel.x, 0.0)).y;
  float r = texture(velocity, vUv + vec2(texel.x, 0.0)).y;
  float b = texture(velocity, vUv - vec2(0.0, texel.y)).x;
  float t = texture(velocity, vUv + vec2(0.0, texel.y)).x;
  outColor = vec4((r - l - t + b) / (2.0 * cell), 0.0, 0.0, 1.0);
}`;

// Every force in one pass, velocity in section heights per second (y up): vorticity
// confinement, a slow curl-noise current, ink beyond the guide sinking so fingers drip,
// a weak pull back toward the guide, and the scripted thread, drips and rolling lobes.
export const force = `${header}
uniform sampler2D velocity;
uniform sampler2D curlField;
uniform sampler2D dye;
uniform sampler2D guide;
uniform vec2 texel;
uniform float cell;
uniform float aspect;
uniform float time;
uniform float dt;
uniform float confinement;
uniform float drift;
uniform float weight;
uniform float pull;
uniform float viscosity;
uniform vec4 jets[${jetCount}];
uniform float jetRadius[${jetCount}];
uniform vec4 swirls[${swirlCount}];
${noise}
void main() {
  float l = abs(texture(curlField, vUv - vec2(texel.x, 0.0)).x);
  float r = abs(texture(curlField, vUv + vec2(texel.x, 0.0)).x);
  float b = abs(texture(curlField, vUv - vec2(0.0, texel.y)).x);
  float t = abs(texture(curlField, vUv + vec2(0.0, texel.y)).x);
  float c = texture(curlField, vUv).x;
  vec2 n = 0.5 * vec2(t - b, r - l);
  n /= length(n) + 1e-4;
  vec2 f = confinement * cell * c * vec2(n.x, -n.y);

  vec2 g = texture(guide, vUv).rg;
  vec2 step2 = texel * 3.0;
  float gl = texture(guide, vUv - vec2(step2.x, 0.0)).r;
  float gr = texture(guide, vUv + vec2(step2.x, 0.0)).r;
  float gb = texture(guide, vUv - vec2(0.0, step2.y)).r;
  float gt = texture(guide, vUv + vec2(0.0, step2.y)).r;
  vec2 slope = vec2(gr - gl, gt - gb) / (6.0 * cell);

  float d = texture(dye, vUv).x;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  const float e = 0.05;
  vec2 q = p * 1.2 + vec2(0.0, time * 0.05);
  float n0 = fbm(q);
  vec2 current = vec2(fbm(q + vec2(0.0, e)) - n0, n0 - fbm(q + vec2(e, 0.0))) / e;
  f += current * drift * (0.25 + g.r);

  f.y -= weight * clamp(d - g.r * 1.15, 0.0, 1.5);
  f += slope * pull * (1.0 - g.r) * min(d, 1.0);

  for (int i = 0; i < ${jetCount}; i++) {
    vec4 j = jets[i];
    if (jetRadius[i] <= 0.0) continue;
    vec2 o = (vUv - j.xy) * vec2(aspect, 1.0);
    f += j.zw * exp(-dot(o, o) / jetRadius[i]);
  }
  for (int i = 0; i < ${swirlCount}; i++) {
    vec4 s = swirls[i];
    if (s.w <= 0.0) continue;
    vec2 o = (vUv - s.xy) * vec2(aspect, 1.0);
    float r2 = dot(o, o);
    f += s.z * vec2(-o.y, o.x) / (sqrt(r2) + 0.04) * exp(-r2 / s.w);
  }

  // A touch of viscosity damps the grid-scale checkerboard a collocated solve leaves behind.
  vec2 v = texture(velocity, vUv).xy;
  vec2 around = 0.25 * (texture(velocity, vUv - vec2(texel.x, 0.0)).xy
    + texture(velocity, vUv + vec2(texel.x, 0.0)).xy
    + texture(velocity, vUv - vec2(0.0, texel.y)).xy
    + texture(velocity, vUv + vec2(0.0, texel.y)).xy);
  v = mix(v, around, viscosity) + dt * f;
  float speed = length(v);
  v *= min(1.0, 0.7 / max(speed, 1e-4));
  outColor = vec4(v, 0.0, 1.0);
}`;

export const divergence = `${header}
uniform sampler2D velocity;
uniform vec2 texel;
uniform float cell;
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
  outColor = vec4((r - l + t - b) / (2.0 * cell), 0.0, 0.0, 1.0);
}`;

export const scale = `${header}
uniform sampler2D source;
uniform float factor;
void main() {
  outColor = texture(source, vUv) * factor;
}`;

export const pressure = `${header}
uniform sampler2D pressureField;
uniform sampler2D divergenceField;
uniform vec2 texel;
uniform float cell;
void main() {
  float l = texture(pressureField, vUv - vec2(texel.x, 0.0)).x;
  float r = texture(pressureField, vUv + vec2(texel.x, 0.0)).x;
  float b = texture(pressureField, vUv - vec2(0.0, texel.y)).x;
  float t = texture(pressureField, vUv + vec2(0.0, texel.y)).x;
  float d = texture(divergenceField, vUv).x;
  outColor = vec4((l + r + b + t - d * cell * cell) * 0.25, 0.0, 0.0, 1.0);
}`;

export const project = `${header}
uniform sampler2D pressureField;
uniform sampler2D velocity;
uniform vec2 texel;
uniform float cell;
void main() {
  float l = texture(pressureField, vUv - vec2(texel.x, 0.0)).x;
  float r = texture(pressureField, vUv + vec2(texel.x, 0.0)).x;
  float b = texture(pressureField, vUv - vec2(0.0, texel.y)).x;
  float t = texture(pressureField, vUv + vec2(0.0, texel.y)).x;
  vec2 v = texture(velocity, vUv).xy - vec2(r - l, t - b) / (2.0 * cell);
  outColor = vec4(v, 0.0, 1.0);
}`;

// MacCormack correction for the dye: advect back, then forward again, and spend half the
// round-trip error, clamped to the source texels so it never rings. Keeps edges crisp.
export const sharpen = `${header}
uniform sampler2D velocity;
uniform sampler2D source;
uniform sampler2D guess;
uniform vec2 texel;
uniform float aspect;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 v = texture(velocity, vUv).xy / vec2(aspect, 1.0);
  vec2 back = vUv - dt * v;
  float ahead = texture(guess, vUv + dt * v).x * (1.0 + dissipation * dt);
  float result = texture(guess, vUv).x + 0.5 * (texture(source, vUv).x - ahead) / (1.0 + dissipation * dt);
  vec2 cell = back / texel - 0.5;
  vec2 base = (floor(cell) + 0.5) * texel;
  float a = texture(source, base).x;
  float b = texture(source, base + vec2(texel.x, 0.0)).x;
  float c = texture(source, base + vec2(0.0, texel.y)).x;
  float d = texture(source, base + texel).x;
  float k = 1.0 / (1.0 + dissipation * dt);
  result = clamp(result, min(min(a, b), min(c, d)) * k, max(max(a, b), max(c, d)) * k);
  outColor = vec4(result, 0.0, 0.0, 1.0);
}`;

export const advect = `${header}
uniform sampler2D velocity;
uniform sampler2D source;
uniform float aspect;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 back = vUv - dt * texture(velocity, vUv).xy / vec2(aspect, 1.0);
  outColor = texture(source, back) / (1.0 + dissipation * dt);
}`;

// Feeds the cloud toward the guide. Fresh ink wells up in noisy patches where the guide is
// dense, ink that strayed past it slowly clears, and scripted drops add the drips.
export const feed = `${header}
uniform sampler2D dye;
uniform sampler2D guide;
uniform float aspect;
uniform float time;
uniform float dt;
uniform float rate;
uniform float clearing;
uniform vec4 drops[${dropCount}];
${noise}
void main() {
  float d = texture(dye, vUv).x;
  vec2 g = texture(guide, vUv).rg;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  float lumps = smoothstep(0.05, 0.4, fbm(p * 5.0 + vec2(time * 0.11, -time * 0.07)));
  float want = g.g * 1.25;
  d += dt * rate * want * lumps * max(0.0, want - d);
  d += dt * 0.5 * max(0.0, g.g - d) * (0.4 + 0.6 * lumps);
  d -= dt * clearing * max(0.0, d - 0.05 - mix(g.g, g.r, 0.35) * 1.15) * (1.4 - g.r);
  for (int i = 0; i < ${dropCount}; i++) {
    vec4 s = drops[i];
    if (s.z <= 0.0) continue;
    vec2 o = (vUv - s.xy) * vec2(aspect, 1.0);
    d += dt * s.w * exp(-dot(o, o) / s.z);
  }
  outColor = vec4(clamp(d, 0.0, 2.0), 0.0, 0.0, 1.0);
}`;

// Shading: a deep black core, translucent grey veils with darker film edges where the dye
// falls off, a glossy rim on the folds, a faint cast shadow, and fine render-time wisps so the
// upscaled dye stays crisp.
export const display = `${header}
uniform sampler2D dye;
uniform sampler2D previous;
uniform vec2 texel;
uniform float blend;
uniform float aspect;
uniform float time;
uniform vec3 water;
uniform vec3 ink;
uniform vec3 veil;
${noise}
void main() {
  vec2 uv = vUv;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 wisp = vec2(gnoise(p * 38.0 + vec2(0.0, time * 0.25)), gnoise(p * 38.0 + vec2(7.3, -time * 0.2)));
  vec2 at = uv + wisp * texel * 0.5;

  float d = mix(texture(previous, at).x, texture(dye, at).x, blend);
  float dl = texture(dye, at - vec2(texel.x * 1.5, 0.0)).x;
  float dr = texture(dye, at + vec2(texel.x * 1.5, 0.0)).x;
  float db = texture(dye, at - vec2(0.0, texel.y * 1.5)).x;
  float dt = texture(dye, at + vec2(0.0, texel.y * 1.5)).x;
  float around = 0.25 * (dl + dr + db + dt);
  vec2 grad = vec2(dr - dl, dt - db);
  d = max(0.0, d + 0.25 * (d - around));

  float thick = 1.0 - exp(-d * 4.6);
  thick = mix(thick, smoothstep(0.03, 0.6, d), 0.5);
  float core = smoothstep(0.45, 0.88, thick);
  float film = clamp(length(grad) * 5.0, 0.0, 1.0) * (1.0 - core) * smoothstep(0.02, 0.2, thick);

  float shade = texture(dye, uv + vec2(0.006, -0.02)).x;
  shade = 1.0 - exp(-shade * 0.5);

  vec2 centred = (uv - vec2(0.5, 0.55)) * vec2(aspect, 1.0);
  vec3 base = water * (1.012 - 0.03 * smoothstep(0.2, 1.3, length(centred)));
  base *= 1.0 - 0.05 * shade * (1.0 - thick);

  vec3 normal = normalize(vec3(-grad * 2.2, 0.5));
  float rim = pow(clamp(dot(normal, normalize(vec3(-0.45, 0.65, 0.6))), 0.0, 1.0), 4.0);
  vec3 tone = mix(veil, ink, core);
  tone += vec3(0.13, 0.135, 0.14) * rim * smoothstep(0.4, 0.85, thick) * (1.0 - 0.6 * core);
  float cover = clamp(thick * 0.92 + film * 0.45, 0.0, 1.0);
  vec3 color = mix(base, tone, cover);

  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  outColor = vec4(color + grain / 255.0, 1.0);
}`;
