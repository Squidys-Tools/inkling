import * as shaders from "./shaders.ts";

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};
type Swap = { read: Target; write: Target; swap: () => void };
type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> };

// Linear sRGB-ish values the shader mixes; the page tokens hold the same tones for the DOM.
const water = [0.953, 0.945, 0.925] as const;
const ink = [0.035, 0.035, 0.04] as const;
const anchor = [0.5, 0.6] as const;

const velocityDissipation = 0.9;
const dyeDissipation = 0.24;
const pressureIterations = 18;

export type Fluid = {
  frame: (seconds: number) => void;
  resize: () => void;
  stir: (x: number, y: number, dx: number, dy: number, radius?: number) => void;
  dispose: () => void;
};

export function createFluid(canvas: HTMLCanvasElement): Fluid | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, shaders.vertex);
  const link = (source: string): Program => {
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, source));
    gl.bindAttribLocation(program, 0, "position");
    gl.linkProgram(program);
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

  let programs: Record<
    | "advect"
    | "curl"
    | "force"
    | "divergence"
    | "pressure"
    | "project"
    | "scale"
    | "splat"
    | "feed"
    | "thread"
    | "display",
    Program
  >;
  try {
    programs = {
      advect: link(shaders.advect),
      curl: link(shaders.curl),
      force: link(shaders.force),
      divergence: link(shaders.divergence),
      pressure: link(shaders.pressure),
      project: link(shaders.project),
      scale: link(shaders.scale),
      splat: link(shaders.splat),
      feed: link(shaders.feed),
      thread: link(shaders.thread),
      display: link(shaders.display),
    };
  } catch {
    return null;
  }

  const createTarget = (
    width: number,
    height: number,
    internal: number,
    format: number,
  ): Target => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, gl.HALF_FLOAT, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer, width, height };
  };
  const createSwap = (width: number, height: number, internal: number, format: number): Swap => {
    const pair = {
      read: createTarget(width, height, internal, format),
      write: createTarget(width, height, internal, format),
      swap: () => {
        [pair.read, pair.write] = [pair.write, pair.read];
      },
    };
    return pair;
  };
  const deleteTarget = (target: Target) => {
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  };

  let velocity: Swap | null = null;
  let dye: Swap | null = null;
  let pressure: Swap | null = null;
  let divergence: Target | null = null;
  let curl: Target | null = null;
  let aspect = 1;

  const size = (short: number) => {
    const ratio = canvas.width / Math.max(1, canvas.height);
    return ratio >= 1 ? [Math.round(short * ratio), short] : [short, Math.round(short / ratio)];
  };

  const allocate = () => {
    for (const swap of [velocity, dye, pressure]) {
      if (swap) {
        deleteTarget(swap.read);
        deleteTarget(swap.write);
      }
    }
    if (divergence) deleteTarget(divergence);
    if (curl) deleteTarget(curl);
    const [vw, vh] = size(144);
    const [dw, dh] = size(Math.min(720, Math.max(360, Math.min(canvas.width, canvas.height))));
    velocity = createSwap(vw, vh, gl.RG16F, gl.RG);
    pressure = createSwap(vw, vh, gl.R16F, gl.RED);
    divergence = createTarget(vw, vh, gl.R16F, gl.RED);
    curl = createTarget(vw, vh, gl.R16F, gl.RED);
    dye = createSwap(dw, dh, gl.R16F, gl.RED);
  };

  let bound: Program | null = null;
  let unit = 0;
  const bind = (program: Program) => {
    bound = program;
    unit = 0;
    gl.useProgram(program.program);
  };
  const set = (name: string, ...values: number[]) => {
    const location = bound?.uniforms.get(name);
    if (location === undefined || location === null) return;
    if (values.length === 1) gl.uniform1f(location, values[0]!);
    else if (values.length === 2) gl.uniform2f(location, values[0]!, values[1]!);
    else gl.uniform3f(location, values[0]!, values[1]!, values[2]!);
  };
  const texture = (name: string, target: Target) => {
    const location = bound?.uniforms.get(name);
    if (location === undefined || location === null) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.uniform1i(location, unit);
    unit += 1;
  };
  const draw = (target: Target | null) => {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const texel = (target: Target) => [1 / target.width, 1 / target.height] as const;

  const pending: { x: number; y: number; dx: number; dy: number; radius: number }[] = [];

  const splat = (x: number, y: number, dx: number, dy: number, radius: number) => {
    if (!velocity || !dye) return;
    bind(programs.splat);
    texture("target", velocity.read);
    set("point", x, y);
    set("value", dx, dy, 0);
    set("radius", radius);
    set("aspect", aspect);
    draw(velocity.write);
    velocity.swap();
    bind(programs.splat);
    texture("target", dye.read);
    set("point", x, y);
    set("value", Math.min(0.5, Math.hypot(dx, dy) / 2400), 0, 0);
    set("radius", radius * 0.35);
    set("aspect", aspect);
    draw(dye.write);
    dye.swap();
  };

  const step = (dt: number, time: number) => {
    if (!velocity || !dye || !pressure || !divergence || !curl) return;
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    for (const s of pending.splice(0)) splat(s.x, s.y, s.dx, s.dy, s.radius);

    bind(programs.thread);
    texture("velocity", velocity.read);
    set("anchor", anchor[0], anchor[1]);
    set("aspect", aspect);
    set("time", time);
    set("dt", dt);
    draw(velocity.write);
    velocity.swap();

    bind(programs.curl);
    texture("velocity", velocity.read);
    set("texel", ...texel(velocity.read));
    draw(curl);

    bind(programs.force);
    texture("velocity", velocity.read);
    texture("curl", curl);
    set("texel", ...texel(velocity.read));
    set("anchor", anchor[0], anchor[1]);
    set("aspect", aspect);
    set("time", time);
    set("dt", dt);
    set("confinement", 12);
    set("drift", 22);
    draw(velocity.write);
    velocity.swap();

    bind(programs.divergence);
    texture("velocity", velocity.read);
    set("texel", ...texel(velocity.read));
    draw(divergence);

    bind(programs.scale);
    texture("source", pressure.read);
    set("factor", 0.8);
    draw(pressure.write);
    pressure.swap();

    bind(programs.pressure);
    set("texel", ...texel(velocity.read));
    for (let i = 0; i < pressureIterations; i++) {
      unit = 0;
      texture("pressure", pressure.read);
      texture("divergence", divergence);
      draw(pressure.write);
      pressure.swap();
    }

    bind(programs.project);
    texture("pressure", pressure.read);
    texture("velocity", velocity.read);
    set("texel", ...texel(velocity.read));
    draw(velocity.write);
    velocity.swap();

    bind(programs.advect);
    texture("velocity", velocity.read);
    texture("source", velocity.read);
    set("texel", ...texel(velocity.read));
    set("dt", dt);
    set("dissipation", velocityDissipation);
    draw(velocity.write);
    velocity.swap();

    bind(programs.feed);
    texture("dye", dye.read);
    set("anchor", anchor[0], anchor[1]);
    set("aspect", aspect);
    set("time", time);
    set("dt", dt);
    set("rate", 1.4);
    draw(dye.write);
    dye.swap();

    bind(programs.advect);
    texture("velocity", velocity.read);
    texture("source", dye.read);
    set("texel", ...texel(velocity.read));
    set("dt", dt);
    set("dissipation", dyeDissipation);
    draw(dye.write);
    dye.swap();
  };

  const render = (time: number) => {
    if (!dye) return;
    bind(programs.display);
    texture("dye", dye.read);
    set("texel", ...texel(dye.read));
    set("aspect", aspect);
    set("time", time);
    set("water", ...water);
    set("ink", ...ink);
    draw(null);
  };

  let last = -1;
  let clock = 0;
  return {
    resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (width === canvas.width && height === canvas.height && velocity) return;
      canvas.width = width;
      canvas.height = height;
      // Phone toolbars resize the page while scrolling; only a real change of shape restarts the ink.
      if (velocity && Math.abs(width / height - aspect) < aspect * 0.12) return;
      aspect = width / height;
      allocate();
      clock = 0;
      // Settle the field before the first visible frame so the page opens on a formed cloud.
      for (let i = 0; i < 200; i++) step(1 / 60, i / 60);
      clock = 200 / 60;
    },
    frame(seconds) {
      const dt = last < 0 ? 1 / 60 : Math.min(1 / 30, Math.max(1 / 240, seconds - last));
      last = seconds;
      clock += dt;
      step(dt, clock);
      render(clock);
    },
    stir(x, y, dx, dy, radius = 0.0016) {
      pending.push({ x, y, dx, dy, radius });
      if (pending.length > 24) pending.shift();
    },
    dispose() {
      for (const swap of [velocity, dye, pressure]) {
        if (swap) {
          deleteTarget(swap.read);
          deleteTarget(swap.write);
        }
      }
      if (divergence) deleteTarget(divergence);
      if (curl) deleteTarget(curl);
      for (const program of Object.values(programs)) gl.deleteProgram(program.program);
      gl.deleteShader(vertex);
      gl.deleteBuffer(quad);
    },
  };
}
