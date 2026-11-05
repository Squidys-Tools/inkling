import { compile, type Program } from "./program.ts";
import {
  advectFragment,
  curlFragment,
  divergenceFragment,
  dyeFragment,
  forceFragment,
  gradientFragment,
  pressureFragment,
} from "./smokeShaders.ts";
import { quadVertex } from "./shaders.ts";

const step = 1 / 30;
const pressureIterations = 12;
const puffCount = 6;
const levels = [1, 0.75, 0.5];

type Target = { texture: WebGLTexture; buffer: WebGLFramebuffer; width: number; height: number };
type Pair = { read: Target; write: Target; swap: () => void };

type Puff = {
  x: number;
  y: number;
  radius: number;
  spin: number;
  dx: number;
  dy: number;
  age: number;
  life: number;
};

/** One wisp's cubic control points in screen uv, [x0, y0, x1, y1, x2, y2, x3, y3]. */
export type Path = number[];

export type Stir = { pointer: [number, number]; push: [number, number] };

export function createSmoke(
  gl: WebGL2RenderingContext,
  quad: WebGLVertexArrayObject,
  mobile: boolean,
  random: () => number,
) {
  // Half-float targets need EXT_color_buffer_float; without it the guide is shown directly.
  const live = Boolean(gl.getExtension("EXT_color_buffer_float"));
  const programs = live
    ? {
        curl: compile(gl, quadVertex, curlFragment),
        force: compile(gl, quadVertex, forceFragment),
        divergence: compile(gl, quadVertex, divergenceFragment),
        pressure: compile(gl, quadVertex, pressureFragment),
        gradient: compile(gl, quadVertex, gradientFragment),
        advect: compile(gl, quadVertex, advectFragment),
        dye: compile(gl, quadVertex, dyeFragment),
      }
    : null;

  const target = (
    width: number,
    height: number,
    internal: number,
    format: number,
    type: number,
  ): Target => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const buffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, buffer, width, height };
  };
  const pair = (make: () => Target): Pair => {
    const result = {
      read: make(),
      write: make(),
      swap: () => {
        [result.read, result.write] = [result.write, result.read];
      },
    };
    return result;
  };
  const free = (each: Target) => {
    gl.deleteTexture(each.texture);
    gl.deleteFramebuffer(each.buffer);
  };

  type Grid = {
    width: number;
    height: number;
    velocity: Pair;
    pressure: Pair;
    curl: Target;
    divergence: Target;
    dye: Pair;
    guide: Target;
  };
  let grid: Grid | null = null;
  let level = 0;
  let aspect = 0;
  let seeded = false;

  const allocate = (nextAspect: number) => {
    if (grid) {
      for (const each of [grid.velocity, grid.pressure, grid.dye]) {
        free(each.read);
        free(each.write);
      }
      free(grid.curl);
      free(grid.divergence);
      free(grid.guide);
    }
    aspect = nextAspect;
    const long = Math.round((mobile ? 128 : 192) * levels[level]);
    const width = aspect >= 1 ? long : Math.max(16, Math.round(long * aspect));
    const height = aspect >= 1 ? Math.max(16, Math.round(long / aspect)) : long;
    const half = (internal: number, format: number) => () =>
      target(width, height, internal, format, gl.HALF_FLOAT);
    const scale = (mobile ? 256 : 512) / (mobile ? 128 : 192);
    const fine = (internal: number, format: number, type: number) =>
      target(Math.round(width * scale), Math.round(height * scale), internal, format, type);
    grid = live
      ? {
          width,
          height,
          velocity: pair(half(gl.RG16F, gl.RG)),
          pressure: pair(half(gl.R16F, gl.RED)),
          curl: half(gl.R16F, gl.RED)(),
          divergence: half(gl.R16F, gl.RED)(),
          dye: pair(() => fine(gl.R16F, gl.RED, gl.HALF_FLOAT)),
          guide: fine(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),
        }
      : {
          width,
          height,
          velocity: pair(() => target(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)),
          pressure: pair(() => target(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)),
          curl: target(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE),
          divergence: target(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE),
          dye: pair(() => target(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)),
          guide: fine(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE),
        };
    seeded = false;
  };

  const fit = (canvasAspect: number) => {
    if (!grid || Math.abs(canvasAspect - aspect) > 0.02) allocate(canvasAspect);
  };

  const puffs: Puff[] = [];
  let spawnIn = 0.3;
  const shape = new Float32Array(puffCount * 4);
  const motion = new Float32Array(puffCount * 4);

  const bezier = (path: Path, t: number) => {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return [
      a * path[0] + b * path[2] + c * path[4] + d * path[6],
      a * path[1] + b * path[3] + c * path[5] + d * path[7],
    ];
  };

  const spawn = (paths: Path[]) => {
    if (!paths.length || puffs.length >= puffCount) return;
    const path = paths[Math.floor(random() * paths.length)];
    const t = 0.2 + random() * 0.7;
    const [x, y] = bezier(path, t);
    const [ax, ay] = bezier(path, Math.min(1, t + 0.05));
    const length = Math.hypot(ax - x, ay - y) || 1;
    puffs.push({
      x,
      y,
      radius: 0.05 + random() * 0.05,
      spin: (random() < 0.5 ? -1 : 1) * (0.03 + random() * 0.025),
      dx: (ax - x) / length,
      dy: (ay - y) / length,
      age: 0,
      life: 3 + random() * 2.5,
    });
  };

  const tickPuffs = (paths: Path[]) => {
    spawnIn -= step;
    if (spawnIn <= 0) {
      spawn(paths);
      spawnIn = 0.4 + random() * 0.6;
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const each = puffs[i];
      each.age += step;
      each.x += each.dx * 0.02 * step;
      each.y += each.dy * 0.02 * step;
      if (each.age > each.life) puffs.splice(i, 1);
    }
    shape.fill(0);
    motion.fill(0);
    puffs.forEach((each, i) => {
      const k = each.age / each.life;
      const envelope = Math.min(1, k * 5) * (1 - k) * (1 - k);
      shape.set([each.x, each.y, each.radius * (1 + k * 0.8), each.spin * envelope], i * 4);
      motion.set([each.dx, each.dy, 0.006 * envelope, each.age < 0.6 ? 1.4 : 0], i * 4);
    });
  };

  const run = (program: Program, into: Target, inputs: [string, WebGLTexture][]) => {
    gl.useProgram(program.program);
    inputs.forEach(([name, texture], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(program.at(name), unit);
    });
    gl.uniform2f(program.at("uTexel"), 1 / into.width, 1 / into.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, into.buffer);
    gl.viewport(0, 0, into.width, into.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const simulate = (time: number, paths: Path[], stir: Stir) => {
    if (!grid || !programs) return;
    const g = grid;
    tickPuffs(paths);
    gl.bindVertexArray(quad);
    gl.disable(gl.BLEND);

    run(programs.curl, g.curl, [["uVelocity", g.velocity.read.texture]]);

    const force = programs.force;
    gl.useProgram(force.program);
    gl.uniform1f(force.at("uDt"), step);
    gl.uniform1f(force.at("uTime"), time);
    gl.uniform1f(force.at("uAspect"), aspect);
    gl.uniform1f(force.at("uSwirl"), 0.04 * g.height);
    gl.uniform4fv(force.at("uPuffShape"), shape);
    gl.uniform4fv(force.at("uPuffMotion"), motion);
    gl.uniform2f(force.at("uPointer"), stir.pointer[0], stir.pointer[1]);
    gl.uniform2f(force.at("uStir"), stir.push[0] * aspect, stir.push[1]);
    run(force, g.velocity.write, [
      ["uVelocity", g.velocity.read.texture],
      ["uCurl", g.curl.texture],
      ["uGuide", g.guide.texture],
    ]);
    g.velocity.swap();

    run(programs.divergence, g.divergence, [["uVelocity", g.velocity.read.texture]]);
    for (let i = 0; i < pressureIterations; i++) {
      run(programs.pressure, g.pressure.write, [
        ["uPressure", g.pressure.read.texture],
        ["uDivergence", g.divergence.texture],
      ]);
      g.pressure.swap();
    }
    run(programs.gradient, g.velocity.write, [
      ["uPressure", g.pressure.read.texture],
      ["uVelocity", g.velocity.read.texture],
    ]);
    g.velocity.swap();

    const advect = programs.advect;
    gl.useProgram(advect.program);
    gl.uniform1f(advect.at("uDt"), step);
    gl.uniform1f(advect.at("uAspect"), aspect);
    gl.uniform1f(advect.at("uKeep"), 0.995);
    run(advect, g.velocity.write, [
      ["uVelocity", g.velocity.read.texture],
      ["uSource", g.velocity.read.texture],
    ]);
    g.velocity.swap();

    const dye = programs.dye;
    gl.useProgram(dye.program);
    gl.uniform1f(dye.at("uDt"), step);
    gl.uniform1f(dye.at("uTime"), time);
    gl.uniform1f(dye.at("uAspect"), aspect);
    gl.uniform1f(dye.at("uSeed"), seeded ? 0 : 0.8);
    gl.uniform4fv(dye.at("uPuffShape"), shape);
    gl.uniform4fv(dye.at("uPuffMotion"), motion);
    run(dye, g.dye.write, [
      ["uVelocity", g.velocity.read.texture],
      ["uDye", g.dye.read.texture],
      ["uGuide", g.guide.texture],
    ]);
    g.dye.swap();
    seeded = true;
  };

  let clock = -1;
  let owed = 0;
  let blend = 1;

  /** Draws the guide with `draw`, then advances the sim at 30Hz toward `time`. */
  const advance = (
    time: number,
    still: boolean,
    paths: Path[],
    stir: Stir,
    draw: (width: number, height: number) => void,
  ) => {
    if (!grid) return;
    const due = !live || still || clock < 0 || time < clock || owed + (time - clock) >= step;
    if (due) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, grid.guide.buffer);
      gl.viewport(0, 0, grid.guide.width, grid.guide.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      draw(grid.guide.width, grid.guide.height);
      gl.disable(gl.BLEND);
    }
    if (!live || still) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return;
    }
    if (clock < 0 || time < clock) {
      clock = time;
      owed = step;
    } else {
      owed += time - clock;
      clock = time;
    }
    let ticks = 0;
    while (owed >= step && ticks < 2) {
      simulate(time - owed + step, paths, stir);
      owed -= step;
      ticks += 1;
    }
    owed = Math.min(owed, step);
    blend = owed / step;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  /** Textures to show: the newest dye, the one before it, and how far to blend between them. */
  const view = (still: boolean) => {
    if (!grid) return null;
    if (!live || still) {
      return {
        now: grid.guide.texture,
        before: grid.guide.texture,
        blend: 1,
        ...texel(grid.guide),
      };
    }
    return {
      now: grid.dye.read.texture,
      before: grid.dye.write.texture,
      blend,
      ...texel(grid.dye.read),
    };
  };
  const texel = (each: Target) => ({ texelX: 1 / each.width, texelY: 1 / each.height });

  const lower = () => {
    if (!live || level >= levels.length - 1) return false;
    level += 1;
    allocate(aspect);
    return true;
  };

  return { fit, advance, view, lower, live };
}
