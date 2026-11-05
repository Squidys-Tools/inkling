export const CARD_COUNT = 34;

export const vertexSource = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

// Everything inside the cube lives in object space, so the water turns with the glass;
// the studio lights stay fixed in world space and slide across the faces as it rotates.
export const fragmentSource = `#version 300 es
precision highp float;
precision highp sampler3D;

#define CARDS ${CARD_COUNT}
#define STEPS 44
#define PI 3.14159265

uniform vec2 uResolution;
uniform float uTime;
uniform mat3 uRotation;
uniform sampler3D uNoise;
uniform vec3 uCards[CARDS * 3];

out vec4 outColor;

const float OUTER = 1.0;
const float INNER = 0.955;
const float LEVEL = 0.7;
const float FLOOR = -1.0;
const vec3 BACKDROP = vec3(0.055, 0.047, 0.04);
const vec3 KEY = normalize(vec3(-0.55, 0.9, 0.35));

bool box(vec3 ro, vec3 rd, float size, out float tNear, out float tFar, out vec3 nNear, out vec3 nFar) {
  vec3 m = 1.0 / rd;
  vec3 n = m * ro;
  vec3 k = abs(m) * size;
  vec3 t1 = -n - k;
  vec3 t2 = -n + k;
  tNear = max(max(t1.x, t1.y), t1.z);
  tFar = min(min(t2.x, t2.y), t2.z);
  nNear = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
  nFar = sign(rd) * step(t2.xyz, t2.yzx) * step(t2.xyz, t2.zxy);
  return tNear < tFar && tFar > 0.0;
}

float band(float azimuth, float center, float width) {
  float a = abs(mod(azimuth - center + PI, 2.0 * PI) - PI);
  return smoothstep(width, width * 0.7, a);
}

vec3 studio(vec3 d) {
  float az = atan(d.x, d.z);
  vec3 c = BACKDROP * (1.0 + 0.6 * smoothstep(-0.2, 0.6, d.y));
  float top = smoothstep(0.72, 0.8, d.y) * band(az, 0.4, 1.1);
  float left = band(az, -2.0, 0.2) * smoothstep(-0.35, -0.2, d.y) * smoothstep(0.85, 0.7, d.y);
  float right = band(az, 0.75, 0.3) * smoothstep(-0.05, 0.15, d.y) * smoothstep(0.8, 0.6, d.y);
  float back = band(az, PI, 0.9) * smoothstep(-0.3, 0.3, d.y) * smoothstep(0.9, 0.4, d.y);
  c += vec3(1.0, 0.97, 0.92) * (5.0 * top + 7.0 * left + 6.0 * right);
  c += vec3(0.5, 0.49, 0.47) * 0.35 * back;
  return c;
}

float noise(vec3 p) { return texture(uNoise, p).r; }

float ink(vec3 p) {
  float t = uTime;
  vec3 q = p * 0.1;
  vec3 warp = vec3(
    noise(q + vec3(0.0, t * 0.006, 0.31)),
    noise(q + vec3(0.47, -t * 0.005, 0.0)),
    noise(q + vec3(0.13, 0.71, t * 0.0055))
  ) - 0.5;
  vec3 w = p + warp * 2.2 + vec3(0.0, t * 0.025, 0.0);
  float n = noise(w * 0.12) * 0.55 + noise(w * 0.25 + 0.37) * 0.3 + noise(w * 0.52 + 0.11) * 0.15;
  float sheet = smoothstep(0.06, 0.0, abs(n - 0.47));
  vec2 axis = p.xz - vec2(sin(p.y * 1.7 + t * 0.05), cos(p.y * 1.3 - t * 0.04)) * 0.18;
  float column = exp(-dot(axis, axis) * 6.0);
  float wall = max(abs(p.x), abs(p.z)) / INNER;
  float pressed = smoothstep(0.82, 1.0, wall) * smoothstep(0.55, 0.75, noise(q * 2.0 + 0.5));
  float body = column + pressed;
  float d = smoothstep(0.6, 0.72, n) * body * 2.2 + sheet * body * 0.5;
  return d * smoothstep(LEVEL, LEVEL - 0.15, p.y);
}

float cardHit(vec3 ro, vec3 rd, float tMax, out vec3 cardNormal, out float cardShade) {
  float best = tMax;
  for (int i = 0; i < CARDS; i++) {
    vec3 c = uCards[i * 3];
    vec3 u = uCards[i * 3 + 1];
    vec3 v = uCards[i * 3 + 2];
    vec3 n = normalize(cross(u, v));
    float denom = dot(rd, n);
    if (abs(denom) < 1e-4) continue;
    float t = dot(c - ro, n) / denom;
    if (t <= 0.0 || t >= best) continue;
    vec3 h = ro + rd * t - c;
    float a = dot(h, u) / dot(u, u);
    float b = dot(h, v) / dot(v, v);
    if (abs(a) > 1.0 || abs(b) > 1.0) continue;
    best = t;
    cardNormal = n * -sign(denom);
    cardShade = 0.9 + 0.1 * fract(float(i) * 0.618);
  }
  return best;
}

vec3 water(vec3 ro, vec3 rd, float t0, float t1, vec3 behind, vec3 keyLocal) {
  vec3 cardNormal = vec3(0.0);
  float cardShade = 0.0;
  float tCard = cardHit(ro, rd, t1, cardNormal, cardShade);
  float tEnd = min(t1, tCard);
  float dt = (tEnd - t0) / float(STEPS);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float transmit = 1.0;
  vec3 color = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + jitter) * dt);
    float d = ink(p);
    if (d < 0.01) continue;
    float lit = clamp(1.0 - ink(p + keyLocal * 0.14) * 1.4, 0.0, 1.0);
    float sheen = lit * lit;
    vec3 tone = mix(vec3(0.005, 0.005, 0.006), vec3(0.78, 0.79, 0.82), sheen * sheen * 0.22);
    float absorb = 1.0 - exp(-d * 22.0 * dt);
    color += transmit * absorb * tone;
    transmit *= 1.0 - absorb;
    if (transmit < 0.02) break;
  }
  vec3 end = behind;
  if (tCard < t1) {
    float facing = 0.6 + 0.4 * clamp(dot(cardNormal, keyLocal) * 0.5 + 0.5, 0.0, 1.0);
    end = vec3(0.98, 0.96, 0.92) * cardShade * facing;
  }
  return color + transmit * end;
}

vec3 waterSurface(vec3 ro, vec3 rd, float t0, float t1, vec3 color) {
  if (abs(rd.y) < 1e-4) return color;
  float t = (LEVEL - ro.y) / rd.y;
  if (t < t0 || t > t1) return color;
  vec3 p = ro + rd * t;
  float edge = max(abs(p.x), abs(p.z)) / INNER;
  float meniscus = smoothstep(0.985, 1.0, edge);
  return color * 0.92 + vec3(0.08) + vec3(0.9) * meniscus * 0.6;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.y, uResolution.x * 0.92);
  vec3 ro = vec3(0.0, 0.75, 6.2);
  vec3 target = vec3(0.0, -0.06, 0.0);
  vec3 fw = normalize(target - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 1.75 + uv.x * rt + uv.y * up);

  float vignette = smoothstep(1.25, 0.15, length(uv * vec2(0.8, 1.0)));
  vec3 color = BACKDROP * (1.0 + 0.3 * vignette);

  if (rd.y < 0.0) {
    float t = (FLOOR - ro.y) / rd.y;
    vec3 p = ro + rd * t;
    float pool = exp(-dot(p.xz, p.xz) * 0.55);
    float contact = smoothstep(1.6, 0.9, max(abs(p.x), abs(p.z)));
    color += vec3(0.16, 0.15, 0.14) * pool * 0.7 - BACKDROP * contact * 0.4;
    color += vec3(0.05, 0.045, 0.04) * exp(-abs(t - 12.0) * 0.3);
    color = mix(color, BACKDROP, smoothstep(6.0, 14.0, t));
  }

  mat3 toLocal = transpose(uRotation);
  vec3 lro = toLocal * ro;
  vec3 lrd = toLocal * rd;
  vec3 keyLocal = toLocal * KEY;

  float tN, tF;
  vec3 nN, nF;
  if (box(lro, lrd, OUTER, tN, tF, nN, nF)) {
    vec3 p = lro + lrd * tN;
    vec3 nW = uRotation * nN;
    float cosi = clamp(-dot(rd, nW), 0.0, 1.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
    vec3 reflected = studio(reflect(rd, nW));

    vec3 dist = OUTER - abs(p);
    float faceEdge = dist.x + dist.y + dist.z - min(min(dist.x, dist.y), dist.z) - max(max(dist.x, dist.y), dist.z);

    vec3 glassDir = refract(lrd, nN, 1.0 / 1.5);
    vec3 through;
    float iN, iF;
    vec3 inN, inF;
    if (box(p + glassDir * 1e-3, glassDir, INNER, iN, iF, inN, inF) && iN > 0.0) {
      vec3 q = p + glassDir * 1e-3;
      vec3 wDir = refract(glassDir, inN, 1.5 / 1.33);
      vec3 entry = q + glassDir * iN;
      float wN, wF;
      vec3 wnN, wnF;
      box(entry, wDir, INNER, wN, wF, wnN, wnF);
      vec3 exitP = entry + wDir * wF;
      vec3 outDir = uRotation * normalize(wDir + wnF * 0.25);
      float corner = smoothstep(0.3, 0.9, min(abs(exitP.x), abs(exitP.z)));
      float lit = smoothstep(-0.2, LEVEL, exitP.y);
      float glow = 0.2 + lit * 0.35 + corner * (0.5 + 0.5 * lit);
      vec3 behind = studio(outDir) * 0.3 + vec3(0.88, 0.88, 0.9) * glow;
      float wetTop = min(wF, entry.y < LEVEL && wDir.y > 0.0 ? (LEVEL - entry.y) / wDir.y : wF);
      if (entry.y < LEVEL) {
        through = water(entry, wDir, 0.0, wetTop, behind, keyLocal);
        if (wetTop < wF) through = through * 0.9 + vec3(0.05);
      } else {
        through = waterSurface(entry, wDir, 0.0, wF, behind * 0.7);
        if (wDir.y < 0.0) {
          float tLevel = (LEVEL - entry.y) / wDir.y;
          if (tLevel < wF) through = waterSurface(entry, wDir, 0.0, wF, water(entry, wDir, tLevel, wF, behind, keyLocal));
        }
      }
      through *= vec3(0.96, 0.98, 0.98);
    } else {
      through = min(studio(uRotation * glassDir), vec3(1.0)) * 0.3 + vec3(0.32);
    }

    float rim = exp(-faceEdge * 160.0);
    float inner = exp(-abs(faceEdge - (OUTER - INNER)) * 220.0);
    float edgeBand = smoothstep(OUTER - INNER + 0.012, OUTER - INNER, faceEdge);
    vec3 edgeLight = min(studio(reflect(rd, normalize(nW + (uRotation * sign(p)) * 0.6))), vec3(1.2));
    through = mix(through, edgeLight * 0.3 + vec3(0.18), edgeBand * 0.35);
    color = mix(through, reflected, fresnel);
    color += vec3(1.0, 0.98, 0.95) * (rim * 0.9 + inner * 0.35) * (0.4 + 0.6 * clamp(dot(nW, KEY) + 0.6, 0.0, 1.0));
  }

  color = color / (1.0 + color * 0.35);
  vec2 frame = gl_FragCoord.xy / uResolution;
  float inside = smoothstep(0.0, 0.12, min(frame.x, 1.0 - frame.x)) * smoothstep(0.0, 0.12, min(frame.y, 1.0 - frame.y));
  color = mix(BACKDROP, color, inside);
  color += (fract(sin(dot(gl_FragCoord.xy, vec2(41.3, 289.1))) * 9631.7) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}
`;
