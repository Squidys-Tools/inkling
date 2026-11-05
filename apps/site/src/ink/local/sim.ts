import {
  formats,
  fullscreenVertex,
  link,
  type Program,
  release,
  target,
  type Target,
} from "./gl.ts";

// The sim runs on the vertical slice through the tank that faces the camera at rest: u across it, y up it.
export const ORIGIN = [-1.35, -0.955] as const;
export const DOMAIN = [2.7, 1.655] as const;
export const DROPS = 2;
const PRESSURE_STEPS = 14;

const head = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 outColor;
`;

const advect = `${head}
uniform sampler2D uVelocity;
uniform vec2 uDomain;
uniform float uDt;
uniform float uKeep;
void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  outColor = vec4(texture(uVelocity, vUv - v * uDt / uDomain).xy * uKeep, 0.0, 1.0);
}
`;

const curl = `${head}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uH;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4((r - l - t + b) * 0.5 / uH, 0.0, 0.0, 1.0);
}
`;

const forces = `${head}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform sampler2D uDye;
uniform sampler3D uNoise;
uniform vec2 uTexel;
uniform vec2 uDomain;
uniform float uDt;
uniform float uTime;
uniform float uVorticity;
uniform float uSink;
uniform float uStir;
uniform float uSlosh;
uniform vec4 uDrops[${DROPS}];
void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  float c = texture(uCurl, vUv).r;
  float l = abs(texture(uCurl, vUv - vec2(uTexel.x, 0.0)).r);
  float r = abs(texture(uCurl, vUv + vec2(uTexel.x, 0.0)).r);
  float b = abs(texture(uCurl, vUv - vec2(0.0, uTexel.y)).r);
  float t = abs(texture(uCurl, vUv + vec2(0.0, uTexel.y)).r);
  vec2 f = vec2(t - b, r - l);
  f *= uVorticity * c / (length(f) + 1e-5);
  f.y = -f.y;

  vec4 dye = texture(uDye, vUv);
  // Ink is denser than water, so it sinks and rolls up into mushroom heads.
  f.y -= uSink * (dye.r + dye.g * 0.6 + dye.b);

  vec2 p = vUv * uDomain;
  vec3 q = vec3(p * 0.06, uTime * 0.006);
  float e = 0.02;
  float nl = texture(uNoise, q - vec3(e, 0.0, 0.0)).r;
  float nr = texture(uNoise, q + vec3(e, 0.0, 0.0)).r;
  float nb = texture(uNoise, q - vec3(0.0, e, 0.0)).r;
  float nt = texture(uNoise, q + vec3(0.0, e, 0.0)).r;
  f += uStir * vec2(nt - nb, nl - nr);

  // A turning tank shears the water: the surface lags one way, the floor the other.
  f.x += uSlosh * (p.y / uDomain.y - 0.5);

  for (int i = 0; i < ${DROPS}; i++) {
    vec4 drop = uDrops[i];
    vec2 d = (vUv - drop.xy) * uDomain;
    f.y -= drop.z * 2.4 * exp(-dot(d, d) * 260.0);
  }
  v += f * uDt;
  v *= exp(-uDt * 0.2);
  outColor = vec4(v, 0.0, 1.0);
}
`;

const divergence = `${head}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uH;
void main() {
  vec2 c = texture(uVelocity, vUv).xy;
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  // Glass on every side: mirror the normal velocity so nothing flows through a wall.
  if (vUv.x - uTexel.x < 0.0) l = -c.x;
  if (vUv.x + uTexel.x > 1.0) r = -c.x;
  if (vUv.y - uTexel.y < 0.0) b = -c.y;
  if (vUv.y + uTexel.y > 1.0) t = -c.y;
  outColor = vec4(0.5 * (r - l + t - b) / uH, 0.0, 0.0, 1.0);
}
`;

const pressure = `${head}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
uniform float uH;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).r;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).r;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).r;
  float div = texture(uDivergence, vUv).r;
  outColor = vec4((l + r + b + t - div * uH * uH) * 0.25, 0.0, 0.0, 1.0);
}
`;

const gradient = `${head}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uH;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).r;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).r;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).r;
  vec2 v = texture(uVelocity, vUv).xy - 0.5 / uH * vec2(r - l, t - b);
  outColor = vec4(v, 0.0, 1.0);
}
`;

const scale = `${head}
uniform sampler2D uSource;
uniform float uKeep;
void main() { outColor = texture(uSource, vUv) * uKeep; }
`;

// Three dye channels share one velocity field; each is the ink on one of the depth slices.
const dye = `${head}
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform sampler2D uTarget;
uniform sampler3D uNoise;
uniform vec2 uDomain;
uniform float uDt;
uniform float uTime;
uniform float uGrow;
uniform float uFade;
uniform vec4 uDrops[${DROPS}];
// Catmull-Rom in five bilinear fetches: plain bilinear advection blurs thin tendrils away within seconds.
vec4 sharp(vec2 uv) {
  vec2 size = vec2(textureSize(uDye, 0));
  vec2 pos = uv * size;
  vec2 c = floor(pos - 0.5) + 0.5;
  vec2 f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t12 = (c + w2 / w12) / size;
  vec2 t0 = (c - 1.0) / size;
  vec2 t3 = (c + 2.0) / size;
  vec4 sum = texture(uDye, vec2(t12.x, t0.y)) * w12.x * w0.y
    + texture(uDye, vec2(t0.x, t12.y)) * w0.x * w12.y
    + texture(uDye, t12) * w12.x * w12.y
    + texture(uDye, vec2(t3.x, t12.y)) * w3.x * w12.y
    + texture(uDye, vec2(t12.x, t3.y)) * w12.x * w3.y;
  float weight = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(sum / weight, 0.0);
}
void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  vec4 d = sharp(vUv - v * uDt / uDomain);
  // Faint haze thins out faster than dense sheets, so the water between curls stays clear while cores hold.
  d = max(d - uDt * (0.015 + 0.09 * (1.0 - smoothstep(0.0, 0.3, d))), 0.0);
  // A slow drifting mask splits the board's broad grey masses into black cores and clear lanes that wander over time.
  float lanes = texture(uNoise, vec3(vUv * uDomain * vec2(0.55, 0.4), uTime * 0.012 + 0.5)).r;
  vec4 goal = vec4(texture(uTarget, vUv).rgb * (0.35 + 1.0 * smoothstep(0.3, 0.7, lanes)), 0.0);
  float patchy = smoothstep(0.55, 0.8, texture(uNoise, vec3(vUv * uDomain * 0.3, uTime * 0.04)).r);
  vec4 gap = goal - d;
  d += max(gap, 0.0) * smoothstep(0.15, 0.4, goal) * uGrow * uDt * (0.04 + 2.0 * patchy) + min(gap, 0.0) * uFade * uDt;
  for (int i = 0; i < ${DROPS}; i++) {
    vec4 drop = uDrops[i];
    vec2 p = (vUv - drop.xy) * uDomain;
    vec4 lane = vec4(equal(vec4(0.0, 1.0, 2.0, 3.0), vec4(drop.w)));
    d += lane * drop.z * uDt * 5.0 * exp(-dot(p, p) * 420.0);
  }
  outColor = clamp(d, 0.0, 1.6);
}
`;

type Programs = Record<
  "advect" | "curl" | "forces" | "divergence" | "pressure" | "gradient" | "scale" | "dye",
  Program
>;

export type StepInput = {
  dt: number;
  time: number;
  drops: Float32Array;
  slosh: number;
};

export function createSim(
  gl: WebGL2RenderingContext,
  noise: WebGLTexture,
  goal: WebGLTexture,
  initialGrid: number,
) {
  const sources = { advect, curl, forces, divergence, pressure, gradient, scale, dye };
  const built: Partial<Programs> = {};
  for (const [name, source] of Object.entries(sources)) {
    const program = link(gl, fullscreenVertex, source);
    if (!program) {
      for (const made of Object.values(built)) gl.deleteProgram(made.handle);
      return null;
    }
    built[name as keyof Programs] = program;
  }
  const programs = built as Programs;
  const kind = formats(gl);

  const size = (grid: number) => {
    const width = grid;
    const height = Math.round((grid * DOMAIN[1]) / DOMAIN[0]);
    return { width, height, dyeWidth: width * 2, dyeHeight: height * 2 };
  };

  const allocate = (grid: number) => {
    const { width, height, dyeWidth, dyeHeight } = size(grid);
    return {
      grid,
      width,
      height,
      h: DOMAIN[0] / width,
      velocity: [target(gl, width, height, kind.rg), target(gl, width, height, kind.rg)],
      pressure: [target(gl, width, height, kind.r), target(gl, width, height, kind.r)],
      divergence: target(gl, width, height, kind.r),
      curl: target(gl, width, height, kind.r),
      dye: [target(gl, dyeWidth, dyeHeight, kind.rgba), target(gl, dyeWidth, dyeHeight, kind.rgba)],
    };
  };

  let state = allocate(initialGrid);

  const bind = (unit: number, handle: WebGLTexture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, handle);
  };
  const draw = (into: Target) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, into.framebuffer);
    gl.viewport(0, 0, into.width, into.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const swap = (pair: Target[]) => pair.reverse();
  const front = (pair: Target[]) => pair[0]!;
  const back = (pair: Target[]) => pair[1]!;

  // Unit 0 holds the noise volume for every pass, so 2D inputs start at unit 1.
  const bindNoise = (program: Program) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, noise);
    gl.uniform1i(program.uniform("uNoise"), 0);
  };

  const copyInto = (from: WebGLTexture, into: Target, keep = 1) => {
    programs.scale.use();
    bind(1, from);
    gl.uniform1i(programs.scale.uniform("uSource"), 1);
    gl.uniform1f(programs.scale.uniform("uKeep"), keep);
    draw(into);
  };

  const seed = (keep: number) => copyInto(goal, front(state.dye), keep);

  const step = ({ dt, time, drops, slosh }: StepInput) => {
    const { width, height, h } = state;
    const texel = [1 / width, 1 / height] as const;

    programs.curl.use();
    bind(1, front(state.velocity).texture);
    gl.uniform1i(programs.curl.uniform("uVelocity"), 1);
    gl.uniform2f(programs.curl.uniform("uTexel"), ...texel);
    gl.uniform1f(programs.curl.uniform("uH"), h);
    draw(state.curl);

    const f = programs.forces;
    f.use();
    bindNoise(f);
    bind(1, front(state.velocity).texture);
    bind(2, state.curl.texture);
    bind(3, front(state.dye).texture);
    gl.uniform1i(f.uniform("uVelocity"), 1);
    gl.uniform1i(f.uniform("uCurl"), 2);
    gl.uniform1i(f.uniform("uDye"), 3);
    gl.uniform2f(f.uniform("uTexel"), ...texel);
    gl.uniform2f(f.uniform("uDomain"), ...DOMAIN);
    gl.uniform1f(f.uniform("uDt"), dt);
    gl.uniform1f(f.uniform("uTime"), time);
    gl.uniform1f(f.uniform("uVorticity"), 0.055);
    gl.uniform1f(f.uniform("uSink"), 0.09);
    gl.uniform1f(f.uniform("uStir"), 0.16);
    gl.uniform1f(f.uniform("uSlosh"), slosh);
    gl.uniform4fv(f.uniform("uDrops"), drops);
    draw(back(state.velocity));
    swap(state.velocity);

    programs.divergence.use();
    bind(1, front(state.velocity).texture);
    gl.uniform1i(programs.divergence.uniform("uVelocity"), 1);
    gl.uniform2f(programs.divergence.uniform("uTexel"), ...texel);
    gl.uniform1f(programs.divergence.uniform("uH"), h);
    draw(state.divergence);

    programs.scale.use();
    bind(1, front(state.pressure).texture);
    gl.uniform1i(programs.scale.uniform("uSource"), 1);
    gl.uniform1f(programs.scale.uniform("uKeep"), 0.8);
    draw(back(state.pressure));
    swap(state.pressure);

    const p = programs.pressure;
    p.use();
    bind(2, state.divergence.texture);
    gl.uniform1i(p.uniform("uPressure"), 1);
    gl.uniform1i(p.uniform("uDivergence"), 2);
    gl.uniform2f(p.uniform("uTexel"), ...texel);
    gl.uniform1f(p.uniform("uH"), h);
    for (let i = 0; i < PRESSURE_STEPS; i++) {
      bind(1, front(state.pressure).texture);
      draw(back(state.pressure));
      swap(state.pressure);
    }

    const g = programs.gradient;
    g.use();
    bind(1, front(state.pressure).texture);
    bind(2, front(state.velocity).texture);
    gl.uniform1i(g.uniform("uPressure"), 1);
    gl.uniform1i(g.uniform("uVelocity"), 2);
    gl.uniform2f(g.uniform("uTexel"), ...texel);
    gl.uniform1f(g.uniform("uH"), h);
    draw(back(state.velocity));
    swap(state.velocity);

    const a = programs.advect;
    a.use();
    bind(1, front(state.velocity).texture);
    gl.uniform1i(a.uniform("uVelocity"), 1);
    gl.uniform2f(a.uniform("uDomain"), ...DOMAIN);
    gl.uniform1f(a.uniform("uDt"), dt);
    gl.uniform1f(a.uniform("uKeep"), 1);
    draw(back(state.velocity));
    swap(state.velocity);

    const d = programs.dye;
    d.use();
    bindNoise(d);
    bind(1, front(state.velocity).texture);
    bind(2, front(state.dye).texture);
    bind(3, goal);
    gl.uniform1i(d.uniform("uVelocity"), 1);
    gl.uniform1i(d.uniform("uDye"), 2);
    gl.uniform1i(d.uniform("uTarget"), 3);
    gl.uniform2f(d.uniform("uDomain"), ...DOMAIN);
    gl.uniform1f(d.uniform("uDt"), dt);
    gl.uniform1f(d.uniform("uTime"), time);
    gl.uniform1f(d.uniform("uGrow"), 0.75);
    gl.uniform1f(d.uniform("uFade"), 0.2);
    gl.uniform4fv(d.uniform("uDrops"), drops);
    draw(back(state.dye));
    swap(state.dye);
  };

  // The governor's first lever: a coarser grid carries the current ink and flow over instead of restarting.
  const resize = (grid: number) => {
    if (grid === state.grid) return;
    const old = state;
    state = allocate(grid);
    copyInto(front(old.velocity).texture, front(state.velocity));
    copyInto(front(old.dye).texture, front(state.dye));
    release(gl, ...old.velocity, ...old.pressure, old.divergence, old.curl, ...old.dye);
  };

  return {
    step,
    seed,
    resize,
    grid: () => state.grid,
    texel: () => [1 / state.width, 1 / state.height] as const,
    dyeTexel: () => [1 / front(state.dye).width, 1 / front(state.dye).height] as const,
    velocity: () => front(state.velocity).texture,
    dye: () => front(state.dye).texture,
    dispose: () => {
      release(gl, ...state.velocity, ...state.pressure, state.divergence, state.curl, ...state.dye);
      for (const program of Object.values(programs)) gl.deleteProgram(program.handle);
    },
  };
}
