import { composite, dyeStep, MAX_DROPS, quadVertex, rippleStep } from "./shaders.ts";

const RIPPLE_SIZE = 256;
const STEP = 1 / 60;
const FALL = 0.65;
const Z_NEAR = 1;
const Z_FAR = 7;
const Z_DROP = 2.2;
const DPR_CAP = 1.5;

type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer };
type Pair = { read: Target; write: Target; width: number; height: number };

type Drop = {
  x: number;
  impact: number;
  seed: number;
  splashed: boolean;
  ring: { y: number; gamma: number; radius: number };
};

export type Layout = { surface: number; band: number };

export type Water = {
  drop: (x: number) => void;
  settle: (x: number, seconds: number) => void;
  start: () => void;
  stop: () => void;
  resize: () => void;
  dispose: () => void;
};

function compile(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    gl.attachShader(program, shader);
  }
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "program");
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };
  return { program, at };
}

function target(gl: WebGL2RenderingContext, width: number, height: number): Target {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return { texture, framebuffer };
}

function pair(gl: WebGL2RenderingContext, width: number, height: number): Pair {
  return { read: target(gl, width, height), write: target(gl, width, height), width, height };
}

function release(gl: WebGL2RenderingContext, p: Pair) {
  for (const t of [p.read, p.write]) {
    gl.deleteTexture(t.texture);
    gl.deleteFramebuffer(t.framebuffer);
  }
}

const swap = (p: Pair) => {
  [p.read, p.write] = [p.write, p.read];
};

/** Returns null when the browser cannot run the simulation, so the caller shows the still. */
export function createWater(canvas: HTMLCanvasElement, layout: () => Layout): Water | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float"))
    return null;

  let ripple: ReturnType<typeof compile>;
  let dye: ReturnType<typeof compile>;
  let final: ReturnType<typeof compile>;
  try {
    ripple = compile(gl, quadVertex, rippleStep);
    dye = compile(gl, quadVertex, dyeStep);
    final = compile(gl, quadVertex, composite);
  } catch {
    return null;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const waves = pair(gl, RIPPLE_SIZE, RIPPLE_SIZE);
  let ink = pair(gl, 2, 2);
  let aspect = 1;
  let dyeAspect = 1;
  let view = layout();

  let drops: Drop[] = [];
  let clock = 0;
  let pending = 0;
  let last = 0;
  let frame = 0;
  let running = false;
  let lost = false;
  let pendingImpulse: [number, number, number, number] | null = null;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    view = layout();
    aspect = width / height;
    dyeAspect = width / (height * view.surface);
    const dyeWidth = Math.min(768, Math.max(200, Math.round(canvas.clientWidth / 1.6)));
    const dyeHeight = Math.max(64, Math.round(dyeWidth / dyeAspect));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (ink.width !== dyeWidth || ink.height !== dyeHeight) {
      release(gl, ink);
      ink = pair(gl, dyeWidth, dyeHeight);
    }
  };

  const draw = (program: ReturnType<typeof compile>, out: Target | null, w: number, h: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, out?.framebuffer ?? null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(program.program);
  };

  const impactUv = (x: number) => {
    const t = (1 / Z_NEAR - 1 / Z_DROP) / (1 / Z_NEAR - 1 / Z_FAR);
    const xmax = (0.5 * aspect * Z_FAR) / Z_DROP;
    const wx = (x - 0.5) * aspect;
    return {
      y: view.surface + view.band * t,
      ripple: [(wx / xmax) * 0.5 + 0.5, (Z_DROP - Z_NEAR) / (Z_FAR - Z_NEAR)],
    };
  };

  const step = () => {
    clock += STEP;
    for (const drop of drops) {
      const age = clock - drop.impact;
      if (age >= 0 && !drop.splashed) {
        drop.splashed = true;
        const { ripple: at } = impactUv(drop.x);
        pendingImpulse = [at[0] ?? 0.5, at[1] ?? 0.5, 0.022, 1.4];
      }
      if (age > 0) {
        const r = drop.ring;
        r.y -= (r.gamma / (4 * Math.PI * r.radius)) * STEP;
        r.gamma *= Math.exp(-STEP / 3);
        r.radius += 0.07 * Math.exp(-age / 2.5) * STEP;
      }
    }
    drops = drops.filter((d) => clock - d.impact < 30);

    for (let i = 0; i < 2; i++) {
      draw(ripple, waves.write, waves.width, waves.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, waves.read.texture);
      gl.uniform1i(ripple.at("state"), 0);
      gl.uniform2f(ripple.at("texel"), 1 / waves.width, 1 / waves.height);
      const impulse = i === 0 && pendingImpulse ? pendingImpulse : [0.5, 0.5, 1, 0];
      gl.uniform4f(
        ripple.at("impulse"),
        impulse[0] ?? 0,
        impulse[1] ?? 0,
        impulse[2] ?? 1,
        impulse[3] ?? 0,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      swap(waves);
    }
    pendingImpulse = null;

    const rings = new Float32Array(MAX_DROPS * 4);
    const sources = new Float32Array(MAX_DROPS * 4);
    drops.forEach((drop, i) => {
      const age = clock - drop.impact;
      if (age < 0) return;
      const x = drop.x * dyeAspect;
      rings.set([x, drop.ring.y, drop.ring.gamma, drop.ring.radius], i * 4);
      const feed = age < 0.45 ? 34 * (1 - age / 0.45) : 0;
      sources.set([x, Math.max(drop.ring.y, 0.93), 0.06, feed], i * 4);
    });
    draw(dye, ink.write, ink.width, ink.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ink.read.texture);
    gl.uniform1i(dye.at("dye"), 0);
    gl.uniform2f(dye.at("texel"), 1 / ink.width, 1 / ink.height);
    gl.uniform1f(dye.at("aspect"), dyeAspect);
    gl.uniform1f(dye.at("time"), clock);
    gl.uniform1f(dye.at("dt"), STEP);
    gl.uniform1i(dye.at("count"), drops.length);
    gl.uniform4fv(dye.at("rings"), rings);
    gl.uniform4fv(dye.at("sources"), sources);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    swap(ink);
  };

  const render = () => {
    draw(final, null, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, waves.read.texture);
    gl.uniform1i(final.at("ripple"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ink.read.texture);
    gl.uniform1i(final.at("dye"), 1);
    gl.uniform2f(final.at("resolution"), canvas.width, canvas.height);
    gl.uniform1f(final.at("surface"), view.surface);
    gl.uniform1f(final.at("band"), view.band);
    gl.uniform1f(final.at("time"), clock);
    const data = new Float32Array(MAX_DROPS * 4);
    drops.forEach((drop, i) => {
      data.set([drop.x, impactUv(drop.x).y, drop.impact, drop.seed], i * 4);
    });
    gl.uniform1i(final.at("count"), drops.length);
    gl.uniform4fv(final.at("drops"), data);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    pending += Math.min(0.1, last ? (now - last) / 1000 : STEP);
    last = now;
    while (pending >= STEP) {
      step();
      pending -= STEP;
    }
    render();
  };

  const add = (x: number, delay: number) => {
    if (drops.length >= MAX_DROPS) drops.shift();
    drops.push({
      x,
      impact: clock + delay,
      seed: Math.random() * 100,
      splashed: false,
      ring: { y: 1, gamma: 0.3, radius: 0.07 },
    });
  };

  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
  };
  canvas.addEventListener("webglcontextlost", onLost);

  resize();

  return {
    drop: (x) => add(x, FALL),
    settle: (x, seconds) => {
      add(x, 0);
      for (let i = 0; i < Math.round(seconds / STEP); i++) step();
      for (const drop of drops) drop.impact = -1e3;
      render();
    },
    start: () => {
      if (running || lost) return;
      running = true;
      last = 0;
      frame = requestAnimationFrame(tick);
    },
    stop: () => {
      running = false;
      cancelAnimationFrame(frame);
    },
    resize: () => {
      resize();
      if (!running && !lost) render();
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", onLost);
      release(gl, waves);
      release(gl, ink);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
