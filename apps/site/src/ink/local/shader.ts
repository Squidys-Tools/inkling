export const vertexSource = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

// The glass is analytic: one ray-box test per surface and no marching. The ink is a live 2D fluid sampled on three
// parallel slices fixed inside the cube, so the layers part with parallax as it turns. Cards come from their own buffer.
export const fragmentSource = `#version 300 es
precision highp float;
precision highp sampler3D;

#define PI 3.14159265

uniform vec2 uResolution;
uniform float uTime;
uniform mat3 uRotation;
uniform vec3 uPlateNormal;
uniform vec3 uPlateAxis;
uniform vec2 uDyeTexel;
uniform sampler2D uDye;
uniform sampler2D uCards;
uniform sampler3D uNoise;

out vec4 outColor;

const float OUTER = 1.0;
const float INNER = 0.955;
const float LEVEL = 0.7;
const float STRETCH = 1.12;
const vec3 BACKDROP = vec3(0.04, 0.032, 0.026);
// The section's studio token as 0-1 values, so the canvas edge disappears into the page.
const vec3 PAGE = vec3(0.0549, 0.0471, 0.0392);
const vec3 KEY = normalize(vec3(0.55, 0.85, 0.45));

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
  return smoothstep(width, width * 0.6, a);
}

vec3 studio(vec3 d) {
  float az = atan(d.x, d.z);
  vec3 c = BACKDROP * (1.0 + 0.6 * smoothstep(-0.2, 0.6, d.y));
  float top = smoothstep(0.6, 0.75, d.y) * band(az, 0.6, 0.9);
  float left = band(az, -1.9, 0.18) * smoothstep(-0.3, -0.1, d.y) * smoothstep(0.8, 0.6, d.y);
  float right = band(az, 0.9, 0.22) * smoothstep(0.0, 0.25, d.y) * smoothstep(0.85, 0.6, d.y);
  c += vec3(1.0, 0.98, 0.95) * (4.0 * top + 5.0 * left + 5.0 * right);
  return c;
}

const float SLICES[3] = float[3](-0.42, 0.0, 0.36);
const vec3 PAPER = vec3(0.87, 0.85, 0.8);

vec2 simUv(vec3 p) {
  return vec2((dot(p, uPlateAxis) + 1.35) / 2.7, (p.y + 0.955) / 1.655);
}

// Linear dye upsampled with an unsharp mask and a fine noise wobble, so a 352px field holds crisp tendrils.
vec4 ink(vec2 uv) {
  vec3 q = vec3(uv * vec2(3.2, 2.0), uTime * 0.01);
  uv += (vec2(texture(uNoise, q).r, texture(uNoise, q + vec3(0.37, 0.61, 0.0)).r) - 0.5) * 0.003;
  vec4 c = texture(uDye, uv);
  vec2 e = uDyeTexel * 1.5;
  vec4 r = texture(uDye, uv + vec2(e.x, 0.0));
  vec4 l = texture(uDye, uv - vec2(e.x, 0.0));
  vec4 t = texture(uDye, uv + vec2(0.0, e.y));
  vec4 b = texture(uDye, uv - vec2(0.0, e.y));
  vec4 sharp = max(c + (c - (r + l + t + b) * 0.25) * 0.7, 0.0);
  // Sheets of ink read darkest where they fold edge-on, so the density gradient adds an outline to each curl.
  vec4 edge = sqrt((r - l) * (r - l) + (t - b) * (t - b));
  return sharp + edge * 0.4 * smoothstep(0.05, 0.35, c);
}

vec3 absorb(vec3 color, float density) {
  // A soft knee: thin sheets stay translucent grey, folds and cores go to near black, faint haze leaves water clear.
  float d = max(density - 0.1, 0.0) / 0.9;
  float a = 3.6 * pow(d, 1.55) + 2.0 * max(density - 0.9, 0.0);
  return color * exp(-a * vec3(1.0, 1.06, 1.15));
}

vec3 backdrop(vec3 exit) {
  float u = dot(exit, uPlateAxis);
  float side = smoothstep(0.58, 0.7, -u) + smoothstep(0.5, 0.62, u);
  vec3 c = mix(vec3(0.3, 0.29, 0.28), vec3(0.88, 0.88, 0.87), side);
  c *= 0.78 + 0.22 * smoothstep(-0.95, 0.3, exit.y);
  c += vec3(0.25, 0.22, 0.18) * exp(-abs(abs(u + 0.06) - 0.64) * 90.0) * (1.0 - side * 0.5);
  if (exit.y < -INNER + 0.002) c = mix(vec3(0.5, 0.49, 0.47), vec3(0.2, 0.19, 0.18), smoothstep(0.4, 0.9, abs(u) * 0.8));
  return c;
}

vec3 inWater(vec3 entry, vec3 dir, float exitT, vec4 card, vec3 cardLocal) {
  vec3 color = backdrop(entry + dir * exitT);
  float dn = dot(dir, uPlateNormal);
  float base = dot(entry, uPlateNormal);
  float cardT = dot(cardLocal - entry, dir);
  bool carded = card.g <= 0.0;
  for (int k = 0; k < 3; k++) {
    int i = dn < 0.0 ? k : 2 - k;
    float t = (SLICES[i] - base) / dn;
    if (t <= 0.0 || t >= exitT) continue;
    if (!carded && cardT > t) {
      color = mix(color, PAPER * card.r, card.g);
      carded = true;
    }
    vec3 p = entry + dir * t;
    vec4 d = ink(simUv(p)) * smoothstep(LEVEL, LEVEL - 0.03, p.y);
    color = absorb(color, i == 0 ? d.g * 0.6 : i == 1 ? d.r : d.b);
  }
  if (!carded) color = mix(color, PAPER * card.r, card.g);
  return color;
}

void main() {
  float scale = min(uResolution.y, uResolution.x * 0.9);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / scale;
  // One pixel in cube units, so lines and the silhouette stay antialiased at any canvas resolution.
  float px = 18.0 / (5.0 * scale);
  vec3 ro = vec3(0.0, 1.5, 18.0);
  vec3 fw = normalize(vec3(0.0, -0.02, 0.0) - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 5.0 + uv.x * rt + uv.y * up);

  vec3 sky = PAGE * (0.85 + 0.6 * smoothstep(1.2, 0.0, length((uv - vec2(0.0, 0.08)) * vec2(0.6, 1.0))));
  vec3 color = sky;
  if (rd.y < 0.0) {
    float t = (-STRETCH - ro.y) / rd.y;
    vec3 p = ro + rd * t;
    float pool = exp(-dot(p.xz, p.xz) * 0.32);
    float shadow = smoothstep(1.5, 0.98, max(abs(p.x), abs(p.z)));
    // A soft reflection of the lit base on the studio floor, right under the glass.
    vec3 local = transpose(uRotation) * p;
    float base = exp(-max(max(abs(local.x), abs(local.z)) - 1.0, 0.0) * 9.0) * (1.0 - shadow);
    color += vec3(0.16, 0.14, 0.12) * pool + vec3(0.2, 0.19, 0.18) * base - BACKDROP * shadow * 0.6;
    color = mix(color, sky, smoothstep(17.0, 28.0, t));
  }

  mat3 toLocal = transpose(uRotation);
  // The tank is a little taller than wide; squashing y keeps every test against a unit cube.
  vec3 squash = vec3(1.0, 1.0 / STRETCH, 1.0);
  vec3 lro = toLocal * ro * squash;
  vec3 lrd = normalize(toLocal * rd * squash);
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
    vec3 q = p + glassDir * 1e-3;
    float iN, iF;
    vec3 inN, inF;
    vec3 through;
    if (box(q, glassDir, INNER, iN, iF, inN, inF) && iN > 0.0) {
      vec3 entry = q + glassDir * iN;
      float wet = smoothstep(LEVEL + 0.004, LEVEL - 0.004, entry.y);
      float aN, aF;
      vec3 aNn, aFn;
      box(entry, lrd, INNER, aN, aF, aNn, aFn);
      vec4 card = texelFetch(uCards, ivec2(gl_FragCoord.xy), 0);
      vec3 cardLocal = toLocal * (ro + rd * (card.b + 16.0)) * squash;
      vec3 water = wet > 0.0 ? inWater(entry, lrd, aF, card, cardLocal) : vec3(0.0);
      float tLevel = lrd.y < 0.0 ? (LEVEL - entry.y) / lrd.y : -1.0;
      vec3 back = INNER - abs(entry + lrd * aF);
      float backEdge = back.x + back.y + back.z - min(min(back.x, back.y), back.z) - max(max(back.x, back.y), back.z);
      vec3 air = vec3(0.5) * exp(-backEdge * 140.0) + mix(vec3(0.24, 0.236, 0.23), vec3(0.36, 0.354, 0.346), smoothstep(LEVEL, OUTER, entry.y)) + studio(uRotation * glassDir) * 0.03;
      if (tLevel > 0.0 && tLevel < aF && wet < 1.0) {
        vec4 film = ink(simUv(entry + lrd * tLevel - vec3(0.0, 0.03, 0.0)));
        air = mix(air, air * 0.2, clamp(film.r + film.g + film.b, 0.0, 1.0) * 0.55);
      }
      through = mix(air, water, wet);
      float meniscus = exp(-abs(entry.y - LEVEL) * 160.0);
      through += vec3(0.55) * meniscus;
    } else {
      through = min(studio(uRotation * glassDir), vec3(1.0)) * 0.25 + vec3(0.12);
    }

    float wall = OUTER - INNER;
    float rim = exp(-faceEdge / max(px * 0.9, 0.0024));
    float innerLine = exp(-abs(faceEdge - wall) / max(px * 0.8, 0.003));
    float slab = smoothstep(wall + 0.006, wall - 0.002, faceEdge);
    through = mix(through, vec3(0.62, 0.64, 0.65), slab * 0.12);
    through += vec3(0.3, 0.3, 0.29) * smoothstep(-0.9, -0.985, p.y);
    vec3 glass = mix(through, reflected, fresnel);
    vec3 pw = uRotation * p;
    float glare = smoothstep(0.22, 0.0, abs(pw.x * 0.75 - pw.y - 0.05)) * smoothstep(0.15, 0.45, pw.x) * step(0.3, nW.x);
    glass += vec3(0.22) * glare * smoothstep(0.0, 0.7, pw.y);
    float lit = 0.45 + 0.55 * clamp(dot(nW, KEY) + 0.5, 0.0, 1.0);
    glass += vec3(1.0, 0.99, 0.97) * (rim * 1.9 + innerLine * 0.6) * lit;
    color = mix(color, glass, smoothstep(0.0, px * 2.5, tF - tN));
  }

  vec2 frame = gl_FragCoord.xy / uResolution;
  float inside = smoothstep(0.0, 0.14, min(frame.x, 1.0 - frame.x)) * smoothstep(0.0, 0.14, min(frame.y, 1.0 - frame.y));
  color = mix(PAGE, color, inside);
  color += (fract(sin(dot(gl_FragCoord.xy, vec2(41.3, 289.1))) * 9631.7) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}
`;
