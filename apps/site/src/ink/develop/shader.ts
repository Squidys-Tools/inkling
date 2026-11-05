export const vertexSource = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// WATER and INK mirror inkDevelopColor.water and inkDevelopColor.ink, so the canvas meets the page edge invisibly.
// uStill is the moodboard frame; uMask marks the photo blob in it; uFlow is a tiling curl-noise field.
export const fragmentSource = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec4 uFrame;
uniform float uTime;
uniform float uForm;
uniform float uBloom;
uniform float uCell;
uniform float uReady;
uniform sampler2D uStill;
uniform sampler2D uMask;
uniform sampler2D uFlow;

out vec4 outColor;

const vec3 WATER = vec3(0.953, 0.945, 0.925);
const vec3 INK = vec3(0.047, 0.047, 0.055);
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float WATER_LUMA = 0.944;
const vec2 BLOOM_FROM = vec2(0.8, 0.44);
const float ASPECT = 1376.0 / 768.0;
const mat2 ROT = mat2(0.7071, 0.7071, -0.7071, 0.7071);

vec2 flow(vec2 uv, float t) {
  vec2 a = texture(uFlow, uv * vec2(2.4, 1.3) + vec2(-t * 0.018, t * 0.006)).rg;
  vec2 b = texture(uFlow, uv * vec2(6.0, 3.4) + vec2(-t * 0.045, -t * 0.012)).rg;
  return (a * 2.0 - 1.0) + 0.45 * (b * 2.0 - 1.0);
}

float band(float edge, float width, float x) {
  return 1.0 - smoothstep(edge - width, edge, x);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 uv = (frag - uFrame.xy) / uFrame.zw;
  float t = uTime;

  if (uReady < 0.5 || uv.y < -0.05 || uv.y > 1.05 || uv.x > 1.05) {
    outColor = vec4(WATER, 1.0);
    return;
  }

  vec2 f = flow(uv, t);
  float wander = f.x * 0.045 + f.y * 0.02;

  // Smoke on the left drifts with the flow; the photo on the right stays still and sharp.
  float loose = 1.0 - smoothstep(0.22, 0.42, uv.x);
  float front = mix(-0.2, 1.12, uForm);
  float churn = (1.0 - smoothstep(0.0, 0.18, abs(uv.x + wander - front))) * (1.0 - uForm * 0.6);
  vec2 drift = f * vec2(1.0, ASPECT) * (0.0055 * loose + 0.004 * churn);
  drift.x -= 0.004 * loose * (0.5 + 0.5 * sin(t * 0.35 + uv.y * 6.0));
  vec3 smoke = texture(uStill, uv + drift).rgb;

  float reach = length((uv - BLOOM_FROM) * vec2(ASPECT, 1.0)) + f.x * 0.07;
  float color = band(uBloom * 1.1, 0.22, reach);
  smoke = mix(WATER * (dot(smoke, LUMA) / WATER_LUMA), smoke, color);

  float blob = texture(uMask, uv).r;
  float density = clamp(1.0 - dot(smoke, LUMA) / WATER_LUMA, 0.0, 1.0);
  float arrived = band(front + density * 0.14 * (1.0 - blob), 0.025, uv.x + wander * 1.3);
  vec3 col = mix(WATER, smoke, arrived);
  if (blob > 0.002) {
    vec3 photo = texture(uStill, uv).rgb;

    vec2 hp = ROT * frag / uCell;
    vec2 cellCenter = transpose(ROT) * ((floor(hp) + 0.5) * uCell);
    vec2 cellUv = (cellCenter - uFrame.xy) / uFrame.zw;
    float lum = dot(textureLod(uStill, cellUv, 2.0).rgb, LUMA);
    float darkness = clamp((WATER_LUMA - lum) / WATER_LUMA, 0.0, 1.0);
    float grown = band(front + darkness * 0.08, 0.035, uv.x + wander);
    float radius = 0.62 * sqrt(darkness) * grown;
    float dist = length(fract(hp) - 0.5);
    float aa = 0.75 / uCell;
    float dots = smoothstep(dist - aa, dist + aa, radius) * step(aa, radius);
    vec3 halftone = mix(WATER, INK, dots * 0.96);

    float condense = smoothstep(0.0, 0.12, front - uv.x - wander) * (1.0 - smoothstep(0.12, 0.3, front - uv.x - wander));
    halftone = mix(halftone, INK, condense * 0.55 * smoothstep(0.35, 0.8, darkness + f.y * 0.25));

    vec3 developed = mix(halftone, photo, color);
    col = mix(col, developed, blob);
  }

  outColor = vec4(col, 1.0);
}
`;
