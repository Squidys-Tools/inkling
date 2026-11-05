const noise = /* glsl */ `
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
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * gnoise(p);
    p = p * 2.07 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum;
}
`;

const frame = /* glsl */ `
uniform vec4 uFrame;
vec2 imageUv(vec2 screen) {
  return uFrame.xy + vec2(screen.x, 1.0 - screen.y) * uFrame.zw;
}
`;

export const quadVertex = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Runs at a fraction of the canvas size: rg is the water's drift, b the fine tendril field, a the light shafts.
export const flowFragment = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
out vec4 outFlow;
${noise}
${frame}
void main() {
  vec2 uv = imageUv(gl_FragCoord.xy / uResolution);
  vec2 p = uv * vec2(1.79, 1.0);
  float t = uTime;
  vec2 warp = vec2(
    fbm(vec3(p * 2.2 + vec2(0.0, t * 0.035), t * 0.05)),
    fbm(vec3(p * 2.2 + vec2(5.2, 1.3 - t * 0.03), t * 0.05 + 7.0))
  );
  vec3 q = vec3(p * 5.0 + warp * 2.4, t * 0.09);
  vec2 drift = vec2(gnoise(q), gnoise(q + vec3(31.4, 17.9, 4.2)));
  drift += warp * 0.9;
  float wisps = 1.0 - abs(fbm(vec3(p * 9.0 + warp * 3.0 - vec2(0.0, t * 0.05), t * 0.07)) * 2.2);
  wisps = smoothstep(0.55, 0.98, wisps);
  float shafts = gnoise(vec3(p.x * 5.5 - p.y * 1.6, 0.0, t * 0.05)) + 0.5 * gnoise(vec3(p.x * 13.0 - p.y * 3.0, 3.0, t * 0.08));
  outFlow = vec4(clamp(drift * 0.5 + 0.5, 0.0, 1.0), wisps, clamp(shafts * 0.5 + 0.5, 0.0, 1.0));
}
`;

export const compositeFragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uStill;
uniform sampler2D uClean;
uniform sampler2D uMask;
uniform sampler2D uFlow;
uniform vec2 uResolution;
uniform float uTime;
uniform float uPour;
uniform float uHit;
out vec4 outColor;
${noise}
${frame}

void main() {
  vec2 screen = gl_FragCoord.xy / uResolution;
  vec2 uv = imageUv(screen);
  vec4 flow = texture(uFlow, screen);
  vec2 drift = flow.rg * 2.0 - 1.0;

  vec4 rest = texture(uMask, uv);
  float surface = 1.0 - smoothstep(0.02, 0.09, uv.y);
  float amount = mix(0.0035 + 0.011 * rest.r + 0.006 * surface, 0.0012, rest.g);
  vec2 at = uv + drift * amount * vec2(0.56, 1.0);
  vec2 inside = clamp(at, vec2(0.001), vec2(0.999));

  vec4 mask = texture(uMask, inside);
  vec3 inked = texture(uStill, inside).rgb;
  vec3 clean = texture(uClean, inside).rgb;
  float ink = smoothstep(0.04, 0.5, mask.r);

  vec2 source = vec2(0.53, 0.0);
  float spread = length((uv - source) * vec2(1.25, 0.82));
  spread += 0.09 * fbm(vec3(uv * vec2(6.0, 4.0), uTime * 0.12));
  float edge = uPour * 1.05;
  float poured = 1.0 - smoothstep(edge - 0.07, edge, spread);
  float front = exp(-pow((spread - edge + 0.035) * 18.0, 2.0)) * step(0.001, uPour) * step(uPour, 0.999);

  vec3 color = mix(mix(clean, inked, 0.1), inked, poured);
  vec3 tint = vec3(0.08, 0.09, 0.11);
  color = mix(color, tint, ink * poured * flow.b * 0.38);
  color = mix(color, clean, ink * poured * (1.0 - flow.b) * 0.08 * (1.0 - rest.g));
  float near = max(ink, smoothstep(0.03, 0.25, textureLod(uMask, inside, 4.0).r));
  color = mix(color, tint, front * near * flow.b * 0.6);

  float water = (1.0 - mask.g) * (1.0 - ink);
  color += vec3(0.03, 0.033, 0.035) * smoothstep(0.55, 0.85, flow.a) * water * (1.0 - smoothstep(0.35, 1.0, uv.y));

  float glow = mask.b;
  float grey = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 dim = vec3(grey + (0.9 - grey) * 0.65 * smoothstep(0.3, 0.62, grey)) * vec3(0.97, 0.985, 1.0);
  color = mix(color, dim, glow * (1.0 - uHit));
  float pulse = 0.85 + 0.15 * sin(uTime * 1.7);
  color += vec3(0.1, 0.16, 0.6) * glow * glow * uHit * pulse * 0.22;

  float below = smoothstep(0.96, 1.0, uv.y);
  if (below > 0.0) {
    vec3 deep = textureLod(uStill, vec2(clamp(uv.x, 0.0, 1.0), 0.985), 5.0).rgb;
    deep += vec3(0.02) * (smoothstep(0.5, 0.9, flow.a) - 0.3);
    color = mix(color, deep, below);
  }
  float above = 1.0 - smoothstep(-0.03, 0.0, uv.y);
  if (above > 0.0) {
    vec3 air = textureLod(uStill, vec2(clamp(uv.x, 0.0, 1.0), 0.004), 4.0).rgb;
    color = mix(color, mix(air, vec3(0.962, 0.962, 0.955), clamp(-uv.y * 30.0, 0.0, 1.0)), above);
  }

  float vignette = smoothstep(0.35, 1.3, length((screen - 0.5) * vec2(uResolution.x / uResolution.y * 0.7, 1.0)));
  color *= 1.0 - 0.05 * vignette;
  color += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}
`;
