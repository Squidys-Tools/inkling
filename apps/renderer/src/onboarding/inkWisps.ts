const WIDTH = 640;
const HEIGHT = 360;
const FRAME_MS = 1000 / 30;
const STILL_TIME = 37;

const vertexSource = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Each wisp: base offset across its axis (aspect units), axis (0 runs along x, 1 along y),
// wave frequency, phase. The copy block sits at uv x 0.18..0.82, y 0.23..0.77.
const fragmentSource = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 uInk;
out vec4 outColor;

const vec2 RES = vec2(${WIDTH}.0, ${HEIGHT}.0);
const float ASPECT = RES.x / RES.y;
const float PEAK = 0.24;
const float HAZE = 0.05;
const float CORE = 0.0042;
const float CENTRE_FLOOR = 0.06;
const int WISPS = 5;
const vec4 WISP[WISPS] = vec4[](
  vec4(0.12, 0.0, 2.3, 0.0),
  vec4(0.89, 0.0, 1.9, 2.1),
  vec4(0.50, 0.0, 3.1, 4.0),
  vec4(0.15, 1.0, 3.4, 1.3),
  vec4(1.63, 1.0, 2.8, 5.2)
);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x / RES.x, 1.0 - gl_FragCoord.y / RES.y);
  vec2 p = vec2(uv.x * ASPECT, uv.y);
  float t = uTime;
  float alpha = 0.0;
  for (int i = 0; i < WISPS; i++) {
    vec4 w = WISP[i];
    float s = float(i);
    float along = w.y < 0.5 ? p.x : p.y;
    float across = w.y < 0.5 ? p.y : p.x;
    float amp = 0.075 + 0.04 * sin(t * 0.07 + s * 1.7);
    float arg = along * w.z + w.w + t * 0.06;
    float drift = noise(vec2(along * 2.6 + t * 0.03, s * 7.3)) - 0.5;
    float centre = w.x + amp * sin(arg) + 0.18 * drift;
    float slope = amp * w.z * cos(arg);
    float norm = inversesqrt(1.0 + slope * slope);
    float d = (across - centre) * norm;
    float twist = sin(along * 8.0 + t * 0.12 + s * 2.0);
    float gap = 0.006 * (0.6 + 0.4 * sin(along * 3.0 - t * 0.09 + s));
    float a = (d - gap * twist) / CORE;
    float b = (d + gap * twist) / CORE;
    float core = max(exp(-a * a), 0.7 * exp(-b * b));
    float h = d / 0.045;
    float haze = exp(-h * h);
    float density = smoothstep(0.4, 0.8, noise(vec2(along * 2.4 - t * 0.04, s * 3.1 + 11.0)));
    alpha += density * (PEAK * core + HAZE * haze);
  }
  vec2 edge = smoothstep(vec2(0.0), vec2(0.07, 0.1), uv) * smoothstep(vec2(0.0), vec2(0.07, 0.1), 1.0 - uv);
  vec2 box = abs(uv - 0.5) - vec2(0.32, 0.27);
  float centreMask = mix(CENTRE_FLOOR, 1.0, smoothstep(-0.03, 0.05, max(box.x, box.y)));
  alpha = min(alpha, PEAK) * edge.x * edge.y * centreMask;
  outColor = vec4(uInk * alpha, alpha);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function inkColor(canvas: HTMLCanvasElement) {
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return [0, 0, 0];
  probe.fillStyle = getComputedStyle(canvas).color;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export function playInkWisps(canvas: HTMLCanvasElement, options: { still: boolean }): () => void {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return () => {};

  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (vertex && fragment) {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return () => {};
  }

  const [r = 0, g = 0, b = 0] = inkColor(canvas);
  gl.useProgram(program);
  gl.uniform3f(gl.getUniformLocation(program, "uInk"), r, g, b);
  const uTime = gl.getUniformLocation(program, "uTime");
  gl.viewport(0, 0, WIDTH, HEIGHT);

  const draw = (time: number) => {
    gl.uniform1f(uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let frame = 0;
  let last = 0;
  let elapsed = STILL_TIME;
  let lost = false;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (last === 0) last = now;
    const delta = now - last;
    if (delta < FRAME_MS - 2) return;
    last = now;
    elapsed += Math.min(delta, 100) / 1000;
    draw(elapsed);
  };

  const start = () => {
    if (lost || frame !== 0 || document.hidden) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else start();
  };
  const onLost = () => {
    lost = true;
    stop();
  };

  canvas.addEventListener("webglcontextlost", onLost);
  draw(elapsed);
  if (!options.still) {
    document.addEventListener("visibilitychange", onVisibility);
    start();
  }

  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", onLost);
    if (!lost) gl.deleteProgram(program);
  };
}
