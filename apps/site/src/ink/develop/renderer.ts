import {
  copySource,
  curlSource,
  divergenceSource,
  dyeSource,
  gradientSource,
  pressureSource,
  renderSource,
  seedSource,
  targetSource,
  velocitySource,
  vorticitySource,
  vertexSource,
} from "./shader.ts";
import { frame as still } from "./timeline.ts";

export type DevelopDetail = { sim: number; dye: number };

export type DevelopFrame = {
  time: number;
  width: number;
  height: number;
  scale: number;
  detail: DevelopDetail;
  rect: { x: number; y: number; scale: number };
  form: number;
  front: number;
  bloom: number;
};

const aspect = still.width / still.height;
const flowSize = 128;
const dotPitch = 6.5;
const stepSeconds = 1 / 30;
const maxStepsPerFrame = 4;
const pressureIterations = 12;
const vorticity = 16;

type Surface = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
};
type Pair = { read: Surface; write: Surface; swap: () => void };
type Format = { internal: number; format: number };

function compile(gl: WebGL2RenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.error(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

/** A tiling, divergence-free flow field from a sum of periodic waves, packed into two bytes per texel. */
function curlField() {
  const waves = Array.from({ length: 10 }, (_, index) => {
    const kx = ((index * 7) % 5) + 1;
    const ky = ((index * 3) % 4) - 1;
    return { kx, ky, phase: index * 2.39, amp: 1 / Math.hypot(kx, ky) };
  });
  const data = new Uint8Array(flowSize * flowSize * 4);
  const vectors = new Float32Array(flowSize * flowSize * 2);
  let peak = 0;
  for (let y = 0; y < flowSize; y++) {
    for (let x = 0; x < flowSize; x++) {
      let vx = 0;
      let vy = 0;
      for (const wave of waves) {
        const angle = (2 * Math.PI * (wave.kx * x + wave.ky * y)) / flowSize + wave.phase;
        const slope = wave.amp * Math.cos(angle);
        vx += slope * wave.ky;
        vy -= slope * wave.kx;
      }
      const index = (y * flowSize + x) * 2;
      vectors[index] = vx;
      vectors[index + 1] = vy;
      peak = Math.max(peak, Math.abs(vx), Math.abs(vy));
    }
  }
  for (let index = 0; index < flowSize * flowSize; index++) {
    data[index * 4] = Math.round((vectors[index * 2] / peak) * 127.5 + 127.5);
    data[index * 4 + 1] = Math.round((vectors[index * 2 + 1] / peak) * 127.5 + 127.5);
    data[index * 4 + 3] = 255;
  }
  return data;
}

/** Runs the live ink sim and draws the develop scene onto `canvas`, or returns null where WebGL2 or float targets are unavailable. */
export function createDevelopRenderer(
  canvas: HTMLCanvasElement,
  sources: { still: string; mask: string },
) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
  if (!gl || gl.isContextLost()) return null;
  if (
    !gl.getExtension("EXT_color_buffer_float") &&
    !gl.getExtension("EXT_color_buffer_half_float")
  ) {
    return null;
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  if (!vertex) return null;
  const shaders: WebGLShader[] = [vertex];
  const programs: WebGLProgram[] = [];
  const build = (source: string) => {
    const fragment = compile(gl, gl.FRAGMENT_SHADER, source);
    if (!fragment) return null;
    shaders.push(fragment);
    const handle = gl.createProgram();
    gl.attachShader(handle, vertex);
    gl.attachShader(handle, fragment);
    gl.bindAttribLocation(handle, 0, "aPosition");
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) return null;
    programs.push(handle);
    const locations = new Map<string, WebGLUniformLocation | null>();
    const at = (name: string) => {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(handle, name));
      return locations.get(name) ?? null;
    };
    return {
      use() {
        gl.useProgram(handle);
      },
      float(name: string, ...values: number[]) {
        const location = at(name);
        if (values.length === 1) gl.uniform1f(location, values[0]);
        else if (values.length === 2) gl.uniform2f(location, values[0], values[1]);
        else gl.uniform4f(location, values[0], values[1], values[2], values[3]);
      },
      texture(name: string, unit: number, texture: WebGLTexture) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(at(name), unit);
      },
    };
  };

  const passes = {
    target: build(targetSource),
    copy: build(copySource),
    seed: build(seedSource),
    velocity: build(velocitySource),
    curl: build(curlSource),
    vorticity: build(vorticitySource),
    divergence: build(divergenceSource),
    pressure: build(pressureSource),
    gradient: build(gradientSource),
    dye: build(dyeSource),
    render: build(renderSource),
  };
  const dispose = () => {
    for (const handle of programs) gl.deleteProgram(handle);
    for (const shader of shaders) gl.deleteShader(shader);
  };
  const {
    target: targetPass,
    copy: copyPass,
    seed: seedPass,
    velocity: velocityPass,
    curl: curlPass,
    vorticity: vorticityPass,
    divergence: divergencePass,
    pressure: pressurePass,
    gradient: gradientPass,
    dye: dyePass,
    render: renderPass,
  } = passes;
  if (
    !targetPass ||
    !copyPass ||
    !seedPass ||
    !velocityPass ||
    !curlPass ||
    !vorticityPass ||
    !divergencePass ||
    !pressurePass ||
    !gradientPass ||
    !dyePass ||
    !renderPass
  ) {
    dispose();
    return null;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const image = (wrap: number) => {
    const handle = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return handle;
  };
  const photo = image(gl.CLAMP_TO_EDGE);
  const mask = image(gl.CLAMP_TO_EDGE);
  const flow = image(gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    flowSize,
    flowSize,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    curlField(),
  );

  const surfaces: Surface[] = [];
  const surface = (width: number, height: number, format: Format, type: number): Surface | null => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, format.internal, width, height, 0, format.format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(fbo);
      return null;
    }
    const made = { texture, fbo, width, height };
    surfaces.push(made);
    return made;
  };
  const release = (made: Surface) => {
    gl.deleteTexture(made.texture);
    gl.deleteFramebuffer(made.fbo);
    surfaces.splice(surfaces.indexOf(made), 1);
  };

  // Some drivers render to RGBA16F but not to one- or two-channel half floats.
  const half = gl.HALF_FLOAT;
  const rgba16: Format = { internal: gl.RGBA16F, format: gl.RGBA };
  const probe = surface(4, 4, { internal: gl.RG16F, format: gl.RG }, half);
  if (probe) release(probe);
  const r16: Format = probe ? { internal: gl.R16F, format: gl.RED } : rgba16;
  const rg16: Format = probe ? { internal: gl.RG16F, format: gl.RG } : rgba16;
  const rgba8: Format = { internal: gl.RGBA8, format: gl.RGBA };

  const pair = (width: number, height: number, format: Format): Pair | null => {
    const one = surface(width, height, format, half);
    const two = surface(width, height, format, half);
    if (!one || !two) return null;
    const made = {
      read: one,
      write: two,
      swap() {
        const read = made.read;
        made.read = made.write;
        made.write = read;
      },
    };
    return made;
  };

  const blit = (into: Surface | null) => {
    if (into) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, into.fbo);
      gl.viewport(0, 0, into.width, into.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  type Field = {
    detail: DevelopDetail;
    sim: { width: number; height: number };
    velocity: Pair;
    dye: Pair;
    pressure: Pair;
    curl: Surface;
    divergence: Surface;
    target: Surface;
  };
  let field: Field | null = null;

  const allocate = (detail: DevelopDetail, front: number) => {
    const simWidth = detail.sim;
    const simHeight = Math.round(detail.sim / aspect);
    const dyeWidth = detail.dye;
    const dyeHeight = Math.round(detail.dye / aspect);
    const velocity = pair(simWidth, simHeight, rg16);
    const dye = pair(dyeWidth, dyeHeight, r16);
    const pressure = pair(simWidth, simHeight, r16);
    const curl = surface(simWidth, simHeight, r16, half);
    const divergence = surface(simWidth, simHeight, r16, half);
    const target = surface(dyeWidth, dyeHeight, rgba8, gl.UNSIGNED_BYTE);
    if (!velocity || !dye || !pressure || !curl || !divergence || !target) return false;

    targetPass.use();
    targetPass.texture("uStill", 0, photo);
    targetPass.texture("uMask", 1, mask);
    blit(target);

    const previous = field;
    if (previous) {
      copyPass.use();
      copyPass.texture("uSource", 0, previous.dye.read.texture);
      blit(dye.read);
      copyPass.texture("uSource", 0, previous.velocity.read.texture);
      blit(velocity.read);
    } else {
      seedPass.use();
      seedPass.texture("uTarget", 0, target.texture);
      seedPass.texture("uFlow", 1, flow);
      seedPass.float("uFront", front);
      blit(dye.read);
      gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.read.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    copyPass.use();
    copyPass.texture("uSource", 0, dye.read.texture);
    blit(dye.write);
    for (const old of previous
      ? [
          previous.velocity.read,
          previous.velocity.write,
          previous.dye.read,
          previous.dye.write,
          previous.pressure.read,
          previous.pressure.write,
          previous.curl,
          previous.divergence,
          previous.target,
        ]
      : []) {
      release(old);
    }
    field = {
      detail,
      sim: { width: simWidth, height: simHeight },
      velocity,
      dye,
      pressure,
      curl,
      divergence,
      target,
    };
    return true;
  };

  const pointer = { x: 0, y: 0, dx: 0, dy: 0 };
  // The first frames run extra steps so the smoke streams in quickly without a blocking warm-up loop.
  const clock = { sim: 0, last: 0, debt: 0, started: false, warm: 45 };

  const step = (time: number, form: number, front: number) => {
    if (!field) return;
    const { velocity, dye, pressure, curl, divergence, target, sim } = field;
    const texel = [1 / sim.width, 1 / sim.height] as const;

    velocityPass.use();
    velocityPass.texture("uVelocity", 0, velocity.read.texture);
    velocityPass.texture("uTarget", 1, target.texture);
    velocityPass.texture("uFlow", 2, flow);
    velocityPass.float("uTexel", ...texel);
    velocityPass.float("uDt", stepSeconds);
    velocityPass.float("uTime", time);
    velocityPass.float("uForm", form);
    velocityPass.float("uFront", front);
    velocityPass.float(
      "uPointer",
      pointer.x,
      1 - pointer.y,
      pointer.dx * sim.width * 6,
      -pointer.dy * sim.height * 6,
    );
    blit(velocity.write);
    velocity.swap();
    pointer.dx = 0;
    pointer.dy = 0;

    curlPass.use();
    curlPass.texture("uVelocity", 0, velocity.read.texture);
    curlPass.float("uTexel", ...texel);
    blit(curl);

    vorticityPass.use();
    vorticityPass.texture("uVelocity", 0, velocity.read.texture);
    vorticityPass.texture("uCurl", 1, curl.texture);
    vorticityPass.float("uTexel", ...texel);
    vorticityPass.float("uDt", stepSeconds);
    vorticityPass.float("uStrength", vorticity);
    blit(velocity.write);
    velocity.swap();

    divergencePass.use();
    divergencePass.texture("uVelocity", 0, velocity.read.texture);
    divergencePass.float("uTexel", ...texel);
    blit(divergence);

    pressurePass.use();
    pressurePass.texture("uDivergence", 1, divergence.texture);
    pressurePass.float("uTexel", ...texel);
    for (let index = 0; index < pressureIterations; index++) {
      pressurePass.texture("uPressure", 0, pressure.read.texture);
      blit(pressure.write);
      pressure.swap();
    }

    gradientPass.use();
    gradientPass.texture("uPressure", 0, pressure.read.texture);
    gradientPass.texture("uVelocity", 1, velocity.read.texture);
    gradientPass.float("uTexel", ...texel);
    blit(velocity.write);
    velocity.swap();

    dyePass.use();
    dyePass.texture("uDye", 0, dye.read.texture);
    dyePass.texture("uVelocity", 1, velocity.read.texture);
    dyePass.texture("uTarget", 2, target.texture);
    dyePass.texture("uFlow", 3, flow);
    dyePass.float("uSimTexel", ...texel);
    dyePass.float("uDt", stepSeconds);
    dyePass.float("uTime", time);
    dyePass.float("uFront", front);
    dyePass.float("uForm", form);
    dyePass.float("uCondense", 0.8 + 5.2 * form * form);
    blit(dye.write);
    dye.swap();
  };

  let pending = 2;
  let disposed = false;
  const load = (src: string, handle: WebGLTexture, mipmaps: boolean) => {
    const element = new Image();
    element.decoding = "async";
    element.onload = () => {
      if (disposed || gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);
      if (mipmaps) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      }
      pending -= 1;
    };
    element.src = src;
  };
  load(sources.still, photo, true);
  load(sources.mask, mask, false);

  let failed = false;

  return {
    get ready() {
      return pending === 0 && !failed;
    },
    /** Pushes the ink with a pointer move, in frame UV (0-1, top-down) and frame UV per second. */
    stir(x: number, y: number, dx: number, dy: number) {
      pointer.x = x;
      pointer.y = y;
      pointer.dx += dx;
      pointer.dy += dy;
    },
    draw(frame: DevelopFrame) {
      if (pending > 0 || failed) return;
      if (
        !field ||
        field.detail.sim !== frame.detail.sim ||
        field.detail.dye !== frame.detail.dye
      ) {
        if (!allocate(frame.detail, frame.front)) {
          failed = true;
          return;
        }
      }
      const delta = clock.started ? Math.min(0.25, Math.max(0, frame.time - clock.last)) : 0;
      clock.last = frame.time;
      clock.started = true;
      clock.debt += delta;
      if (clock.warm > 0) {
        clock.warm -= 1;
        clock.debt += stepSeconds * 2;
      }
      for (let steps = 0; clock.debt >= stepSeconds && steps < maxStepsPerFrame; steps++) {
        clock.sim += stepSeconds;
        clock.debt -= stepSeconds;
        step(clock.sim, frame.form, frame.front);
      }
      clock.debt = Math.min(clock.debt, stepSeconds * 0.99);
      const live = field;
      if (!live) return;

      const width = Math.max(1, Math.round(frame.width * frame.scale));
      const height = Math.max(1, Math.round(frame.height * frame.scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ratio = width / frame.width;
      const { x, y, scale } = frame.rect;
      renderPass.use();
      renderPass.texture("uDye", 0, live.dye.read.texture);
      renderPass.texture("uDyePrev", 1, live.dye.write.texture);
      renderPass.texture("uStill", 2, photo);
      renderPass.texture("uMask", 3, mask);
      renderPass.texture("uFlow", 4, flow);
      renderPass.float("uResolution", width, height);
      renderPass.float(
        "uFrame",
        x * ratio,
        y * ratio,
        still.width * scale * ratio,
        still.height * scale * ratio,
      );
      renderPass.float("uTime", frame.time);
      renderPass.float("uFront", frame.front);
      renderPass.float("uBloom", frame.bloom);
      renderPass.float("uCell", Math.max(4.5 * ratio, dotPitch * scale * ratio));
      renderPass.float("uMix", clock.debt / stepSeconds);
      renderPass.float("uDyeTexel", 1 / live.dye.read.width, 1 / live.dye.read.height);
      blit(null);
    },
    dispose() {
      disposed = true;
      for (const made of surfaces) {
        gl.deleteTexture(made.texture);
        gl.deleteFramebuffer(made.fbo);
      }
      surfaces.length = 0;
      for (const handle of [photo, mask, flow]) gl.deleteTexture(handle);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      dispose();
    },
  };
}
