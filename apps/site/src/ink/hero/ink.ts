import * as shaders from "./shaders.ts";

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};
type Swap = { read: Target; write: Target; swap: () => void };
type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> };

const water = [0.937, 0.933, 0.91] as const;
const ink = [0.03, 0.03, 0.028] as const;
const veil = [0.2, 0.205, 0.215] as const;

// The governor steps down this ladder: sim grid first, then dye, then output scale.
// Sizes are the long side in texels; the sim never runs near screen resolution.
const levels = [
  { sim: 160, dye: 512, output: 1 },
  { sim: 128, dye: 512, output: 1 },
  { sim: 128, dye: 384, output: 0.85 },
  { sim: 96, dye: 320, output: 0.7 },
  { sim: 96, dye: 256, output: 0.55 },
] as const;
const coarseLevel = 2;
const pressureIterations = 12;
const stepSeconds = 1 / 30;
const slowFrame = 20;
const sampleCount = 30;
const settleSteps = 15;
const develop = 2.5;

type Format = { internal: number; format: number; type?: number };
type PlateBox = { left: number; top: number; width: number; height: number };
type Splat = { x: number; y: number; dx: number; dy: number; radius: number };

export type Ink = {
  frame: (seconds: number) => void;
  resize: (width: number, height: number, ratio: number, plate: PlateBox) => void;
  stir: (x: number, y: number, dx: number, dy: number, radius: number) => void;
  dispose: () => void;
};

// Places in the moodboard plate (0..1, y down) the choreography works from.
const thread = { x: 0.53, top: -0.1, bottom: 0.45 };
const lobes = [
  { x: 0.12, y: 0.62, spin: 1 },
  { x: 0.42, y: 0.66, spin: -1 },
  { x: 0.82, y: 0.82, spin: 1 },
  { x: 0.66, y: 0.36, spin: -1 },
] as const;
// The cloud's underside above the pill, where drips form and sink across it.
const drips = [
  { from: 0.3, to: 0.56, y: 0.9 },
  { from: 0.58, to: 0.8, y: 0.96 },
] as const;

function random(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createInk(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  coarse = false,
): Ink | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  });
  if (!gl) return null;
  gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("EXT_color_buffer_half_float");

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    return shader;
  };
  const link = (vertex: WebGLShader, source: string): Program => {
    const program = gl.createProgram();
    const fragment = compile(gl.FRAGMENT_SHADER, source);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "position");
    gl.linkProgram(program);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "program");
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) uniforms.set(info.name, gl.getUniformLocation(program, info.name));
    }
    return { program, uniforms };
  };

  const names = [
    "target",
    "copy",
    "splat",
    "curl",
    "force",
    "divergence",
    "scale",
    "pressure",
    "project",
    "advect",
    "sharpen",
    "feed",
    "display",
  ] as const;
  const programs = {} as Record<(typeof names)[number], Program>;
  try {
    const vertex = compile(gl.VERTEX_SHADER, shaders.vertex);
    for (const name of names) programs[name] = link(vertex, shaders[name]);
    gl.deleteShader(vertex);
  } catch {
    return null;
  }

  // Half floats where the driver can render to them; RGBA16F is the widest fallback.
  const formats: Record<"one" | "two", Format> = {
    one: { internal: gl.R16F, format: gl.RED },
    two: { internal: gl.RG16F, format: gl.RG },
  };
  const probe = (internal: number, format: number) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, gl.HALF_FLOAT, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    return ok;
  };
  if (!probe(gl.R16F, gl.RED) || !probe(gl.RG16F, gl.RG)) {
    if (!probe(gl.RGBA16F, gl.RGBA)) return null;
    formats.one = { internal: gl.RGBA16F, format: gl.RGBA };
    formats.two = { internal: gl.RGBA16F, format: gl.RGBA };
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const plate = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, plate);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const createTarget = (width: number, height: number, kind: Format): Target => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      kind.internal,
      width,
      height,
      0,
      kind.format,
      kind.type ?? gl.HALF_FLOAT,
      null,
    );
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer, width, height };
  };
  const createSwap = (width: number, height: number, kind: Format): Swap => {
    const pair = {
      read: createTarget(width, height, kind),
      write: createTarget(width, height, kind),
      swap: () => {
        [pair.read, pair.write] = [pair.write, pair.read];
      },
    };
    return pair;
  };
  const deleteTarget = (target: Target | null) => {
    if (!target) return;
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  };
  const deleteSwap = (swap: Swap | null) => {
    if (!swap) return;
    deleteTarget(swap.read);
    deleteTarget(swap.write);
  };

  let bound: Program | null = null;
  let unit = 0;
  const bind = (program: Program) => {
    bound = program;
    unit = 0;
    gl.useProgram(program.program);
  };
  const location = (name: string) => bound?.uniforms.get(name) ?? null;
  const set = (name: string, ...values: number[]) => {
    const at = location(name);
    if (!at) return;
    if (values.length === 1) gl.uniform1f(at, values[0]!);
    else if (values.length === 2) gl.uniform2f(at, values[0]!, values[1]!);
    else if (values.length === 3) gl.uniform3f(at, values[0]!, values[1]!, values[2]!);
    else gl.uniform4f(at, values[0]!, values[1]!, values[2]!, values[3]!);
  };
  const texture = (name: string, target: Target | WebGLTexture) => {
    const at = location(name);
    if (!at) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, "texture" in target ? target.texture : target);
    gl.uniform1i(at, unit);
    unit += 1;
  };
  const draw = (target: Target | null) => {
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const view = {
    width: 1,
    height: 1,
    ratio: 1,
    level: coarse ? coarseLevel : 0,
    plate: [0, 0, 1, 1] as [number, number, number, number],
  };
  let velocity: Swap | null = null;
  let pressure: Swap | null = null;
  let dye: Swap | null = null;
  let scratch: Target | null = null;
  let guide: Target | null = null;
  let curl: Target | null = null;
  let divergence: Target | null = null;
  let seeded = false;
  const aspect = () => view.width / Math.max(1, view.height);
  const fit = (long: number) => {
    const a = aspect();
    return a >= 1
      ? [long, Math.max(8, Math.round(long / a))]
      : [Math.max(8, Math.round(long * a)), long];
  };

  // Moves a field into a new size without losing what it holds, so a resize or a governor
  // step never restarts the ink.
  const carry = (from: Swap | null, to: Swap) => {
    if (!from) return;
    bind(programs.copy);
    texture("source", from.read);
    draw(to.read);
    draw(to.write);
  };

  const drawGuide = () => {
    if (!guide) return;
    bind(programs.target);
    texture("plate", plate);
    set("plateRect", ...view.plate);
    draw(guide);
  };

  const allocate = () => {
    const level = levels[view.level]!;
    const scale = view.ratio * level.output;
    canvas.width = Math.max(1, Math.round(view.width * scale));
    canvas.height = Math.max(1, Math.round(view.height * scale));
    const [sw, sh] = fit(level.sim);
    const [dw, dh] = fit(level.dye);
    if (!velocity || velocity.read.width !== sw || velocity.read.height !== sh) {
      const next = createSwap(sw!, sh!, formats.two);
      carry(velocity, next);
      deleteSwap(velocity);
      velocity = next;
      deleteSwap(pressure);
      pressure = createSwap(sw!, sh!, formats.one);
      deleteTarget(curl);
      curl = createTarget(sw!, sh!, formats.one);
      deleteTarget(divergence);
      divergence = createTarget(sw!, sh!, formats.one);
    }
    if (!dye || dye.read.width !== dw || dye.read.height !== dh) {
      const next = createSwap(dw!, dh!, formats.one);
      carry(dye, next);
      deleteSwap(dye);
      dye = next;
      deleteTarget(scratch);
      scratch = createTarget(dw!, dh!, formats.one);
      deleteTarget(guide);
      guide = createTarget(dw!, dh!, { internal: gl.RG8, format: gl.RG, type: gl.UNSIGNED_BYTE });
    }
    drawGuide();
    if (!seeded && dye && guide) {
      // Open on a soft version of the composition; the live sim folds it into ink from there.
      bind(programs.scale);
      texture("source", guide);
      set("factor", 0.7);
      draw(dye.read);
      draw(dye.write);
      seeded = true;
    }
  };

  const pending: Splat[] = [];
  const points = new Float32Array(shaders.splatCount * 4);
  const values = new Float32Array(shaders.splatCount * 3);
  const jets = new Float32Array(shaders.jetCount * 4);
  const jetRadius = new Float32Array(shaders.jetCount);
  const swirls = new Float32Array(shaders.swirlCount * 4);
  const drops = new Float32Array(shaders.dropCount * 4);

  // Plate coordinates (y down) to section uv (y up).
  const at = (x: number, y: number) =>
    [view.plate[0] + x * view.plate[2], view.plate[1] + (1 - y) * view.plate[3]] as const;

  // The scripted part of the motion: a swaying thread that keeps falling into the cloud,
  // lobes that roll, and drips that form under the cloud and sink across the pill.
  const choreograph = (time: number) => {
    jets.fill(0);
    jetRadius.fill(0);
    drops.fill(0);
    const size = view.plate[3];
    const sway = 0.035 * Math.sin(time * 0.21) + 0.015 * Math.sin(time * 0.53 + 1.1);
    for (let i = 0; i < 3; i++) {
      const y = thread.top + ((thread.bottom - thread.top) * (i + 0.5)) / 3;
      const [x, sy] = at(thread.x + sway * (1 - y), y);
      jets.set([x, sy, Math.sin(time * 0.4 + i) * 0.08, -0.55], i * 4);
      jetRadius[i] = 0.0012 * size;
    }
    const [tx, ty] = at(thread.x + sway, -0.02);
    drops.set([tx, ty, 0.0006 * size, 0.5], 0);

    drips.forEach((drip, i) => {
      const period = 3.2 + i * 0.9;
      const cycle = (time + i * 1.7) / period;
      const n = Math.floor(cycle);
      const life = cycle - n;
      const x = drip.from + (drip.to - drip.from) * random(n * 7 + i * 13);
      const pulse = Math.sin(Math.PI * Math.min(1, life * 1.6)) ** 2;
      const [dx, dy] = at(x, drip.y + life * 0.14);
      const slot = 3 + i;
      jets.set([dx, dy, (random(n * 3 + i) - 0.5) * 0.3, -1.2 * pulse], slot * 4);
      jetRadius[slot] = 0.0009 * size;
      drops.set([dx, dy, 0.0004 * size, 2 * pulse], (1 + i) * 4);
    });

    lobes.forEach((lobe, i) => {
      const wobble = time * (0.17 + i * 0.03) + i * 1.9;
      const [x, y] = at(lobe.x + 0.05 * Math.sin(wobble), lobe.y + 0.04 * Math.cos(wobble * 1.3));
      const strength = 0.09 + 0.05 * Math.sin(time * 0.31 + i * 2.2);
      swirls.set([x, y, lobe.spin * strength, 0.02 * size], i * 4);
    });
  };

  const splatPending = (field: Swap) => {
    points.fill(0);
    values.fill(0);
    pending.splice(0, shaders.splatCount).forEach((s, i) => {
      points.set([s.x, s.y, s.radius, 0], i * 4);
      values.set([s.dx * aspect(), s.dy, 0], i * 3);
    });
    bind(programs.splat);
    texture("source", field.read);
    set("aspect", aspect());
    gl.uniform4fv(location("points[0]"), points);
    gl.uniform3fv(location("values[0]"), values);
    draw(field.write);
    field.swap();
  };

  const step = (time: number, dt: number) => {
    if (!velocity || !pressure || !dye || !scratch || !guide || !curl || !divergence) return;
    const cell = 1 / velocity.read.height;
    const texel = [1 / velocity.read.width, 1 / velocity.read.height] as const;
    const a = aspect();
    const young = Math.max(0, 1 - time / develop);

    if (pending.length) splatPending(velocity);

    choreograph(time);

    bind(programs.curl);
    texture("velocity", velocity.read);
    set("texel", ...texel);
    set("cell", cell);
    draw(curl);

    bind(programs.force);
    texture("velocity", velocity.read);
    texture("curlField", curl);
    texture("dye", dye.read);
    texture("guide", guide);
    set("texel", ...texel);
    set("cell", cell);
    set("aspect", a);
    set("time", time);
    set("dt", dt);
    set("confinement", 7);
    set("drift", 0.1);
    set("weight", 0.25);
    set("pull", 0.25);
    set("viscosity", 0.3);
    gl.uniform4fv(location("jets[0]"), jets);
    gl.uniform1fv(location("jetRadius[0]"), jetRadius);
    gl.uniform4fv(location("swirls[0]"), swirls);
    draw(velocity.write);
    velocity.swap();

    bind(programs.divergence);
    texture("velocity", velocity.read);
    set("texel", ...texel);
    set("cell", cell);
    draw(divergence);

    bind(programs.scale);
    texture("source", pressure.read);
    set("factor", 0.8);
    draw(pressure.write);
    pressure.swap();

    bind(programs.pressure);
    set("texel", ...texel);
    set("cell", cell);
    for (let i = 0; i < pressureIterations; i++) {
      unit = 0;
      texture("pressureField", pressure.read);
      texture("divergenceField", divergence);
      draw(pressure.write);
      pressure.swap();
    }

    bind(programs.project);
    texture("pressureField", pressure.read);
    texture("velocity", velocity.read);
    set("texel", ...texel);
    set("cell", cell);
    draw(velocity.write);
    velocity.swap();

    bind(programs.advect);
    texture("velocity", velocity.read);
    texture("source", velocity.read);
    set("aspect", a);
    set("dt", dt);
    set("dissipation", 0.8);
    draw(velocity.write);
    velocity.swap();

    bind(programs.feed);
    texture("dye", dye.read);
    texture("guide", guide);
    set("aspect", a);
    set("time", time);
    set("dt", dt);
    set("rate", 2.6 + 5 * young);
    set("clearing", 0.5);
    gl.uniform4fv(location("drops[0]"), drops);
    draw(dye.write);
    dye.swap();

    bind(programs.advect);
    texture("velocity", velocity.read);
    texture("source", dye.read);
    set("aspect", a);
    set("dt", dt);
    set("dissipation", 0.03);
    draw(scratch);

    bind(programs.sharpen);
    texture("velocity", velocity.read);
    texture("source", dye.read);
    texture("guess", scratch);
    set("texel", 1 / dye.read.width, 1 / dye.read.height);
    set("aspect", a);
    set("dt", dt);
    set("dissipation", 0.03);
    draw(dye.write);
    dye.swap();
  };

  // After a step, dye.write holds the same step before advection, so blending the two
  // smooths the 30Hz sim into the 60Hz render.
  const render = (time: number, blend: number) => {
    if (!dye) return;
    bind(programs.display);
    texture("dye", dye.read);
    texture("previous", dye.write);
    set("texel", 1 / dye.read.width, 1 / dye.read.height);
    set("blend", blend);
    set("aspect", aspect());
    set("time", time);
    set("water", ...water);
    set("ink", ...ink);
    set("veil", ...veil);
    draw(null);
  };

  let last = -1;
  let clock = 0;
  let owed = 0;
  let steps = 0;
  const samples: number[] = [];

  const govern = (elapsed: number) => {
    if (steps < settleSteps) return;
    samples.push(elapsed);
    if (samples.length < sampleCount) return;
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    samples.length = 0;
    if (average > slowFrame && view.level < levels.length - 1) {
      view.level += 1;
      allocate();
    }
  };

  return {
    resize(width, height, ratio, box) {
      view.width = Math.max(1, width);
      view.height = Math.max(1, height);
      view.ratio = ratio;
      view.plate = [
        box.left / view.width,
        1 - (box.top + box.height) / view.height,
        box.width / view.width,
        box.height / view.height,
      ];
      allocate();
    },
    frame(seconds) {
      const elapsed = last < 0 ? 16 : (seconds - last) * 1000;
      last = seconds;
      // A hidden tab or a long pause skews the average; only real frame gaps count.
      if (elapsed < 250) govern(elapsed);
      owed += Math.min(elapsed / 1000, stepSeconds * 2);
      let ran = 0;
      while (owed >= stepSeconds && ran < 2) {
        clock += stepSeconds;
        step(clock, stepSeconds);
        owed -= stepSeconds;
        steps += 1;
        ran += 1;
      }
      if (ran === 2) owed = Math.min(owed, stepSeconds);
      render(clock + owed, steps > 0 ? owed / stepSeconds : 1);
    },
    stir(x, y, dx, dy, radius) {
      pending.push({ x, y, dx: dx * 60, dy: dy * 60, radius });
      if (pending.length > shaders.splatCount * 3) pending.shift();
    },
    dispose() {
      deleteSwap(velocity);
      deleteSwap(pressure);
      deleteSwap(dye);
      deleteTarget(scratch);
      deleteTarget(guide);
      deleteTarget(curl);
      deleteTarget(divergence);
      for (const program of Object.values(programs)) gl.deleteProgram(program.program);
      gl.deleteTexture(plate);
      gl.deleteBuffer(quad);
    },
  };
}
