export const MAX_DROPS = 6;

export const quadVertex = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

export const rippleStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D state;
uniform vec2 texel;
uniform vec4 impulse;
out vec4 outColor;
void main() {
  vec2 s = texture(state, vUv).rg;
  float sum = texture(state, vUv + vec2(texel.x, 0.0)).r
    + texture(state, vUv - vec2(texel.x, 0.0)).r
    + texture(state, vUv + vec2(0.0, texel.y)).r
    + texture(state, vUv - vec2(0.0, texel.y)).r;
  float next = (sum * 0.5 - s.g) * 0.993;
  vec2 d = (vUv - impulse.xy) / impulse.z;
  next -= impulse.w * exp(-dot(d, d));
  vec2 edge = smoothstep(0.0, 0.04, vUv) * smoothstep(0.0, 0.04, 1.0 - vUv);
  outColor = vec4(next * edge.x * edge.y, s.r, 0.0, 1.0);
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
float potential(vec2 p, float t) {
  return gnoise(vec3(p * 3.1, t * 0.11)) + 0.5 * gnoise(vec3(p * 7.3, t * 0.19 + 4.0)) + 0.25 * gnoise(vec3(p * 15.1, t * 0.27 + 9.0));
}
vec2 curl(vec2 p, float t) {
  float e = 0.004;
  float dx = potential(p + vec2(e, 0.0), t) - potential(p - vec2(e, 0.0), t);
  float dy = potential(p + vec2(0.0, e), t) - potential(p - vec2(0.0, e), t);
  return vec2(dy, -dx) / (2.0 * e);
}`;

// Each drop is a vortex ring seen in section: two counter-rotating cores whose
// mutual induction carries the ink down, while curl noise frays its edges.
export const dyeStep = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D dye;
uniform vec2 texel;
uniform float aspect;
uniform float time;
uniform float dt;
uniform int count;
uniform vec4 rings[${MAX_DROPS}];
uniform vec4 sources[${MAX_DROPS}];
out vec4 outColor;
${noise}
vec2 vortex(vec2 p, vec2 c, float gamma, float core) {
  vec2 d = p - c;
  float r2 = dot(d, d) + 1e-6;
  return gamma / (6.2831853 * r2) * (1.0 - exp(-r2 / (core * core))) * vec2(-d.y, d.x);
}
vec2 velocity(vec2 p, float here) {
  vec2 v = curl(p, time) * (0.005 + 0.06 * here);
  v.y -= 0.03 * here;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= count) break;
    vec4 r = rings[i];
    if (r.z <= 0.0) continue;
    float core = 0.55 * r.w;
    v += vortex(p, r.xy - vec2(r.w, 0.0), -r.z, core);
    v += vortex(p, r.xy + vec2(r.w, 0.0), r.z, core);
  }
  return v;
}
void main() {
  vec2 scale = vec2(aspect, 1.0);
  vec2 p = vUv * scale;
  float here = texture(dye, vUv).r;
  vec2 v = velocity(p, clamp(here, 0.0, 1.0));
  vec2 mid = vUv - 0.5 * dt * v / scale;
  v = velocity(mid * scale, clamp(texture(dye, mid).r, 0.0, 1.0));
  vec2 back = vUv - dt * v / scale;
  float d = texture(dye, back).r;
  float blur = (texture(dye, back + vec2(texel.x, 0.0)).r + texture(dye, back - vec2(texel.x, 0.0)).r
    + texture(dye, back + vec2(0.0, texel.y)).r + texture(dye, back - vec2(0.0, texel.y)).r) * 0.25;
  d = mix(d, blur, 0.004) * exp(-dt / 90.0);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= count) break;
    vec4 s = sources[i];
    if (s.w <= 0.0) continue;
    vec2 q = (p - s.xy) / vec2(s.z * 0.8, s.z * 1.3);
    float n = 0.75 + 0.5 * gnoise(vec3(p * 60.0, float(i)));
    d += s.w * dt * exp(-dot(q, q)) * n;
  }
  d *= smoothstep(0.0, 0.01, vUv.x) * smoothstep(0.0, 0.01, 1.0 - vUv.x) * smoothstep(0.0, 0.01, vUv.y);
  outColor = vec4(min(d, 4.0), 0.0, 0.0, 1.0);
}`;

export const composite = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D ripple;
uniform sampler2D dye;
uniform vec2 resolution;
uniform float surface;
uniform float band;
uniform float time;
uniform int count;
uniform vec4 drops[${MAX_DROPS}];
out vec4 outColor;
${noise}

const vec3 AIR = vec3(0.953, 0.945, 0.925);
const vec3 WATER_TOP = vec3(0.905, 0.918, 0.925);
const vec3 WATER_DEEP = vec3(0.935, 0.94, 0.94);
const vec3 INK = vec3(0.035, 0.035, 0.04);
const vec3 INK_THIN = vec3(0.30, 0.25, 0.21);
const vec3 SHADE = vec3(0.42, 0.45, 0.48);
const float Z_NEAR = 1.0;
const float Z_FAR = 7.0;
const float Z_DROP = 2.2;

float aspect() { return resolution.x / resolution.y; }

vec2 rippleUv(float sx, float z) {
  float x = (sx - 0.5) * aspect() * z / Z_DROP;
  float xmax = 0.5 * aspect() * Z_FAR / Z_DROP;
  return vec2(x / xmax * 0.5 + 0.5, (z - Z_NEAR) / (Z_FAR - Z_NEAR));
}

float depthAt(float t) {
  return 1.0 / mix(1.0 / Z_NEAR, 1.0 / Z_FAR, t);
}

float height(vec2 uv) { return texture(ripple, uv).r; }

vec3 inkOver(vec3 base, float d) {
  float a = 1.0 - exp(-d * 3.6);
  vec3 ink = mix(INK_THIN, INK, smoothstep(0.15, 0.9, d));
  return mix(base, ink, a);
}

vec3 air(vec2 uv) {
  float glow = smoothstep(1.2, 0.0, distance(uv * vec2(aspect(), 1.0), vec2(0.62 * aspect(), surface + 0.1)));
  return mix(AIR * 0.985, AIR * 1.01, glow);
}

vec3 underwater(vec2 uv, vec2 bend) {
  float depth = clamp((surface - uv.y) / surface, 0.0, 1.0);
  vec3 water = mix(WATER_TOP, WATER_DEEP, smoothstep(0.0, 0.6, depth));
  water = mix(water, AIR, smoothstep(0.55, 1.0, depth) * 0.6);
  vec2 duv = vec2(uv.x, uv.y / surface) + bend;
  vec2 fp = vec2(duv.x * resolution.x / (resolution.y * surface), duv.y);
  float coarse = texture(dye, duv).r;
  if (coarse > 0.002) {
    vec2 warp = vec2(gnoise(vec3(fp * 11.0, time * 0.05)), gnoise(vec3(fp * 11.0 + 7.0, time * 0.05)));
    duv += warp * 0.012 * vec2(surface * resolution.y / resolution.x, 1.0);
  }
  float d = texture(dye, duv).r;
  vec3 c = inkOver(water, d);
  float meniscus = exp(-pow((surface - uv.y) / 0.004, 2.0));
  return mix(c, SHADE, meniscus * 0.35);
}

vec3 surfaceBand(vec2 uv, float t) {
  float z = depthAt(t);
  vec2 ru = rippleUv(uv.x, z);
  vec2 e = vec2(1.5 / 256.0);
  float hx = height(ru + vec2(e.x, 0.0)) - height(ru - vec2(e.x, 0.0));
  float hz = height(ru + vec2(0.0, e.y)) - height(ru - vec2(0.0, e.y));
  vec3 n = normalize(vec3(-hx * 2.0, 1.0, -hz * 4.0));
  vec3 view = normalize(vec3((uv.x - 0.5) * 0.4, -0.12 - 0.25 * (1.0 - t), 1.0));
  vec3 r = reflect(view, n);
  float elevation = r.y;
  vec3 sky = mix(mix(SHADE, AIR, 0.3), AIR, smoothstep(0.05, 0.3, elevation));
  sky = mix(sky, AIR * 1.015, smoothstep(0.55, 0.95, elevation));
  float fresnel = 0.35 + 0.6 * pow(1.0 - clamp(dot(-view, n), 0.0, 1.0), 3.0);
  vec2 bend = vec2(hx, hz) * 0.25;
  vec3 below = underwater(vec2(uv.x, surface - 0.01 - 0.05 * t), bend);
  vec3 c = mix(below, sky, fresnel);
  float farFade = smoothstep(0.45, 1.0, t);
  return mix(c, air(uv), farFade);
}

vec3 scene(vec2 uv) {
  float front = surface + height(rippleUv(uv.x, Z_NEAR)) * 0.02;
  if (uv.y < front) {
    vec2 bend = vec2(height(rippleUv(uv.x, Z_NEAR + 0.3)) * 0.01, 0.0) * exp(-(front - uv.y) * 30.0);
    return underwater(uv, bend);
  }
  float t = (uv.y - front) / band;
  if (t < 1.0) return surfaceBand(uv, t);
  return air(uv);
}

float hash(float n) { return fract(sin(n) * 43758.5453); }

vec4 sphere(vec2 q, float r) {
  float d = length(q) / r;
  if (d > 1.0) return vec4(0.0);
  vec3 n = vec3(q / r, sqrt(max(0.0, 1.0 - d * d)));
  return vec4(n, smoothstep(1.0, 0.85, d));
}

void main() {
  vec2 uv = vUv;
  float a = aspect();
  vec3 color = scene(uv);
  float px = 1.0 / resolution.y;

  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= count) break;
    vec4 drop = drops[i];
    float age = time - drop.z;
    vec2 impact = vec2(drop.x, drop.y);
    vec2 q = (uv - impact) * vec2(a, 1.0);
    float seed = drop.w;

    if (age < 0.0) {
      float fall = -age;
      float y = impact.y + 4.9 * fall * fall * 0.25;
      vec2 dq = (uv - vec2(impact.x, y)) * vec2(a, 1.0);
      dq.y /= 1.0 + min(fall, 0.2);
      vec4 s = sphere(dq, 0.017);
      if (s.w > 0.0) {
        float spec = pow(max(0.0, dot(s.xyz, normalize(vec3(-0.4, 0.6, 0.7)))), 30.0);
        vec3 c = INK * (0.6 + 0.4 * s.z) + spec * 0.8;
        color = mix(color, c, s.w);
      }
      continue;
    }

    if (age < 1.15) {
      float life = age / 1.15;
      float r = 0.02 + 0.13 * sqrt(life);
      float squash = 0.16;
      float h = 0.15 * pow(sin(3.14159 * min(life * 1.25, 1.0)), 0.7) * (0.7 + 0.3 * hash(seed));
      float rr = r * (1.0 + 0.35 * clamp(q.y / max(h, 1e-4), 0.0, 1.0));
      float cx = clamp(q.x / rr, -1.0, 1.0);
      if (abs(q.x) < rr) {
        float s = sqrt(1.0 - cx * cx);
        for (int side = 0; side < 2; side++) {
          float sy = side == 0 ? s : -s;
          float theta = atan(sy, cx);
          float base = rr * squash * sy;
          float spikes = pow(abs(cos(theta * 7.0 + seed * 3.0)), 10.0);
          float top = h * (0.82 + 0.3 * spikes);
          float rel = (q.y - base) / max(top, 1e-4);
          if (rel > 0.0 && rel < 1.0) {
            float edge = smoothstep(0.75, 1.0, abs(cx));
            float lines = 0.5 + 0.5 * sin(rel * 26.0 + theta * 2.0 + age * 6.0);
            float rim = smoothstep(0.86, 1.0, rel);
            float alpha = (side == 0 ? 0.6 : 0.85) * (0.3 + 0.6 * edge + 0.3 * lines * (1.0 - edge) + 0.6 * rim);
            alpha *= smoothstep(0.0, 0.05, rel) * (1.0 - smoothstep(0.9, 1.0, life));
            vec2 bent = uv + vec2(cx * 0.012, -rel * 0.01);
            vec3 glass = scene(bent) * (0.72 + 0.2 * lines) + vec3(0.1) * rim * (1.0 - lines);
            glass = mix(glass, SHADE * 0.35, edge * 0.75 + rim * 0.3);
            color = mix(color, glass, clamp(alpha, 0.0, 1.0));
          }
        }
      }
      for (int k = 0; k < 12; k++) {
        float fk = float(k);
        float theta = 6.28318 * (fk + hash(seed + fk) * 0.6) / 12.0;
        float speed = 0.25 + 0.15 * hash(seed * 1.7 + fk);
        float lift = 0.55 + 0.35 * hash(seed * 2.3 + fk);
        float launch = 0.12 + 0.12 * hash(seed + fk * 3.1);
        float t = age - launch;
        if (t < 0.0) continue;
        vec2 p = vec2(cos(theta) * (r + speed * t * 0.4), sin(theta) * squash * (r + speed * t * 0.4) + h * 0.95 + lift * t - 1.4 * t * t);
        if (p.y < sin(theta) * squash * r - 0.002) continue;
        vec4 s = sphere(q - p, 0.005 + 0.004 * hash(seed + fk * 5.0));
        if (s.w > 0.0) {
          vec3 c = mix(SHADE * 0.45, AIR, smoothstep(0.2, 0.9, s.z));
          color = mix(color, c, s.w * 0.85);
        }
      }
    }

    float jetAge = age - 0.55;
    if (jetAge > 0.0 && jetAge < 0.9) {
      float jl = jetAge / 0.9;
      float jh = 0.12 * sin(3.14159 * jl);
      float w = 0.01 * (1.0 - 0.5 * clamp(q.y / max(jh, 1e-4), 0.0, 1.0));
      float body = smoothstep(w, w - px * 1.5, abs(q.x)) * step(0.0, q.y) * step(q.y, jh);
      vec4 bead = sphere(q - vec2(0.0, jh + 0.014 + 0.04 * jl), 0.013);
      float alpha = max(body * 0.85, bead.w);
      vec3 c = mix(INK, scene(uv + vec2(q.x * 0.5, 0.0)) * 0.6, 0.35);
      c += pow(max(0.0, bead.z * 0.7 - bead.x * 0.5), 12.0) * 0.6;
      color = mix(color, c, alpha * smoothstep(1.0, 0.85, jl));
    }
  }

  float grain = hash(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + time) - 0.5;
  outColor = vec4(color + grain * 0.012, 1.0);
}`;
