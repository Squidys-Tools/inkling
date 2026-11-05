import {
  compositeFragment,
  copyFragment,
  curlFragment,
  divergenceFragment,
  dyeFragment,
  pressureFragment,
  projectFragment,
  quadVertex,
  velocityFragment,
} from "./shaders.ts";

const imageAspect = 1376 / 768;
const domainAspect = 0.7 * imageAspect;
const step = 1 / 30;
const pressureIterations = 12;
const warmSteps = 60;

function compile(gl: WebGL2RenderingContext, fragment: string) {
  const program = gl.createProgram();
  for (const [kind, source] of [
    [gl.VERTEX_SHADER, quadVertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(kind);
    if (!shader) throw new Error("shader allocation failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed");
    gl.attachShader(program, shader);
  }
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };
  return { program, at };
}

type Program = ReturnType<typeof compile>;

function upload(gl: WebGL2RenderingContext, image: TexImageSource, mipmaps: boolean) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

type Format = { internal: number; format: number; type: number };
type Target = { texture: WebGLTexture; buffer: WebGLFramebuffer; width: number; height: number };

function allocate(gl: WebGL2RenderingContext, width: number, height: number, format: Format) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    format.internal,
    width,
    height,
    0,
    format.format,
    format.type,
    null,
  );
  const buffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return { texture, buffer, width, height };
}

function release(gl: WebGL2RenderingContext, target: Target | undefined) {
  if (!target) return;
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.buffer);
}

class Swap {
  constructor(
    public read: Target,
    public write: Target,
  ) {}
  flip() {
    [this.read, this.write] = [this.write, this.read];
  }
}

const ease = (x: number) => x * x * (3 - 2 * x);

/** The part of the moodboard plate on screen, as image uv: x, y of the top left, then width, height. */
function framing(aspect: number, progress: number) {
  const settle = ease(Math.min(1, progress / 0.5));
  if (aspect < 1) {
    const width = 0.5 / (1.12 - 0.12 * settle);
    const height = (width * imageAspect) / aspect;
    return [0.505 - width / 2, 0.49 - height * (0.36 - 0.04 * settle), width, height] as const;
  }
  const zoom = 1.2 - 0.2 * settle;
  let width = 1;
  let height = imageAspect / aspect;
  if (height > 1) {
    width = 1 / height;
    height = 1;
  }
  width /= zoom;
  height /= zoom;
  const cx = 0.52 - 0.02 * settle;
  const cy = 0.34 + 0.16 * settle;
  const x = Math.min(1 - width, Math.max(0, cx - width / 2));
  const y = Math.min(1 - height, Math.max(0, cy - height / 2));
  return [x, y, width, height] as const;
}

/** Source pixels per CSS pixel at rest, so the canvas never renders finer than the plate. */
export function plateDensity(cssWidth: number, cssHeight: number) {
  const [, , width] = framing(cssWidth / cssHeight, 1);
  return (width * 1376) / cssWidth;
}

export type Plates = { still: TexImageSource; clean: TexImageSource; mask: TexImageSource };
/** Pointer position on the canvas (0..1, y down) and its motion in canvas widths and heights per second. */
export type Pointer = { x: number; y: number; dx: number; dy: number };
export type Frame = {
  progress: number;
  time: number;
  dt: number;
  hit: number;
  pour: number;
  guide: number;
  pointer?: Pointer;
};

export function createScene(canvas: HTMLCanvasElement, plates: Plates) {
  const context = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
  if (!context) throw new Error("webgl2 unavailable");
  const gl: WebGL2RenderingContext = context;
  const live = gl.getExtension("EXT_color_buffer_float") !== null;
  const half = (internal: number, format: number): Format =>
    live
      ? { internal, format, type: gl.HALF_FLOAT }
      : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  const vector = half(gl.RG16F, gl.RG);
  const scalar = half(gl.R16F, gl.RED);

  const programs = {
    curl: compile(gl, curlFragment),
    velocity: compile(gl, velocityFragment),
    divergence: compile(gl, divergenceFragment),
    pressure: compile(gl, pressureFragment),
    project: compile(gl, projectFragment),
    dye: compile(gl, dyeFragment),
    copy: compile(gl, copyFragment),
    composite: compile(gl, compositeFragment),
  };

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const still = upload(gl, plates.still, true);
  const clean = upload(gl, plates.clean, true);
  const mask = upload(gl, plates.mask, true);
  const calm = allocate(gl, 1, 1, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });

  let velocity: Swap | undefined;
  let pressure: Swap | undefined;
  let dye: Swap | undefined;
  let curl: Target | undefined;
  let divergence: Target | undefined;
  let simLong = 0;
  let width = 0;
  let height = 0;
  let aspect = 1;
  let clock = 0;
  let lag = 0;
  let steps = 0;
  let push: Pointer | undefined;

  const bind = (program: Program, textures: [string, WebGLTexture][]) => {
    gl.useProgram(program.program);
    textures.forEach(([name, texture], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(program.at(name), unit);
    });
  };
  const draw = (target: Target | null) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.buffer : null);
    gl.viewport(0, 0, target ? target.width : width, target ? target.height : height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  function grid(long: number) {
    const simW = long;
    const simH = Math.round(long / domainAspect);
    const dyeW = Math.min(512, Math.max(256, long * 2));
    const dyeH = Math.round(dyeW / domainAspect);
    const previous = dye;
    for (const swap of [velocity, pressure])
      if (swap) for (const target of [swap.read, swap.write]) release(gl, target);
    release(gl, curl);
    release(gl, divergence);
    velocity = new Swap(allocate(gl, simW, simH, vector), allocate(gl, simW, simH, vector));
    pressure = new Swap(allocate(gl, simW, simH, scalar), allocate(gl, simW, simH, scalar));
    curl = allocate(gl, simW, simH, scalar);
    divergence = allocate(gl, simW, simH, scalar);
    dye = new Swap(allocate(gl, dyeW, dyeH, vector), allocate(gl, dyeW, dyeH, vector));
    if (previous) {
      gl.bindVertexArray(quad);
      bind(programs.copy, [["uSource", previous.read.texture]]);
      draw(dye.read);
      release(gl, previous.read);
      release(gl, previous.write);
    } else {
      steps = 0;
    }
  }

  function resize(cssWidth: number, cssHeight: number, ratio: number, long: number) {
    aspect = cssWidth / Math.max(1, cssHeight);
    const w = Math.max(1, Math.round(cssWidth * ratio));
    const h = Math.max(1, Math.round(cssHeight * ratio));
    if (w !== width || h !== height) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
    }
    if (long !== simLong) {
      simLong = long;
      grid(long);
    }
  }

  function advance(frame: Frame, view: readonly number[]) {
    if (!velocity || !pressure || !dye || !curl || !divergence) return;
    const sim = velocity.read;
    const texel = [1 / sim.width, 1 / sim.height] as const;
    const source = [0.543 + 0.025 * Math.sin(clock * 0.37), 0.055] as const;
    const catchUp = 0.9 * Math.max(0, 1 - steps / warmSteps) * frame.guide;

    if (live) {
      bind(programs.curl, [["uVelocity", sim.texture]]);
      gl.uniform2f(programs.curl.at("uTexel"), ...texel);
      draw(curl);

      const pointer = [-1, -1, 0, 0];
      if (push) {
        const sx = view[0] + push.x * view[2];
        const sy = view[1] + push.y * view[3];
        pointer[0] = (sx - 0.15) / 0.7;
        pointer[1] = sy;
        pointer[2] = Math.max(-1, Math.min(1, push.dx)) * ((view[2] / 0.7) * sim.width) * 0.12;
        pointer[3] = Math.max(-1, Math.min(1, push.dy)) * view[3] * sim.height * 0.12;
        push = undefined;
      }
      const v = programs.velocity;
      bind(v, [
        ["uVelocity", sim.texture],
        ["uCurl", curl.texture],
        ["uDye", dye.read.texture],
        ["uMask", mask],
      ]);
      gl.uniform2f(v.at("uTexel"), ...texel);
      gl.uniform1f(v.at("uDt"), step);
      gl.uniform1f(v.at("uTime"), clock);
      gl.uniform1f(v.at("uGuide"), frame.guide);
      gl.uniform1f(v.at("uPour"), frame.pour);
      gl.uniform1f(v.at("uHit"), frame.hit);
      gl.uniform2f(v.at("uSource"), ...source);
      gl.uniform4f(v.at("uPointer"), pointer[0], pointer[1], pointer[2], pointer[3]);
      draw(velocity.write);
      velocity.flip();

      bind(programs.divergence, [["uVelocity", velocity.read.texture]]);
      gl.uniform2f(programs.divergence.at("uTexel"), ...texel);
      draw(divergence);

      const p = programs.pressure;
      gl.useProgram(p.program);
      gl.uniform2f(p.at("uTexel"), ...texel);
      for (let i = 0; i < pressureIterations; i++) {
        bind(p, [
          ["uPressure", pressure.read.texture],
          ["uDivergence", divergence.texture],
        ]);
        gl.uniform1f(p.at("uKeep"), i === 0 ? 0.8 : 1);
        draw(pressure.write);
        pressure.flip();
      }

      bind(programs.project, [
        ["uPressure", pressure.read.texture],
        ["uVelocity", velocity.read.texture],
      ]);
      gl.uniform2f(programs.project.at("uTexel"), ...texel);
      draw(velocity.write);
      velocity.flip();
    }

    const d = programs.dye;
    bind(d, [
      ["uVelocity", live ? velocity.read.texture : calm.texture],
      ["uDye", dye.read.texture],
      ["uMask", mask],
    ]);
    gl.uniform2f(d.at("uTexel"), 1 / dye.read.width, 1 / dye.read.height);
    gl.uniform2f(d.at("uSimTexel"), ...texel);
    gl.uniform1f(d.at("uDt"), step);
    gl.uniform1f(d.at("uTime"), clock);
    gl.uniform1f(d.at("uGuide"), frame.guide);
    gl.uniform1f(d.at("uPour"), frame.pour);
    gl.uniform1f(d.at("uHit"), frame.hit);
    gl.uniform1f(d.at("uCatchUp"), catchUp);
    gl.uniform1f(d.at("uProcedural"), live ? 0 : 1);
    gl.uniform2f(d.at("uSource"), ...source);
    draw(dye.write);
    dye.flip();
    steps += 1;
  }

  function render(frame: Frame) {
    if (width === 0 || !velocity || !dye) return;
    const view = framing(aspect, frame.progress);
    gl.bindVertexArray(quad);
    if (frame.pointer) push = frame.pointer;

    lag += Math.min(frame.dt, 0.1);
    let budget = 2;
    while (lag >= step && budget > 0) {
      advance(frame, view);
      clock += step;
      lag -= step;
      budget -= 1;
    }
    lag = Math.min(lag, step);

    const c = programs.composite;
    bind(c, [
      ["uStill", still],
      ["uClean", clean],
      ["uMask", mask],
      ["uDye", dye.read.texture],
      ["uVelocity", live ? velocity.read.texture : calm.texture],
    ]);
    gl.uniform2f(c.at("uResolution"), width, height);
    gl.uniform2f(c.at("uDyeTexel"), 1 / dye.read.width, 1 / dye.read.height);
    gl.uniform2f(c.at("uSimTexel"), 1 / velocity.read.width, 1 / velocity.read.height);
    gl.uniform4f(c.at("uFrame"), ...view);
    gl.uniform1f(c.at("uTime"), frame.time);
    gl.uniform1f(c.at("uLag"), lag);
    gl.uniform1f(c.at("uHit"), frame.hit);
    draw(null);
  }

  function dispose() {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { resize, render, dispose, live };
}
