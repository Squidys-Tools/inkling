import {
  advectDyeStep,
  advectVelocityStep,
  composite,
  copyStep,
  curlStep,
  divergenceStep,
  dyeStep,
  forceStep,
  MAX_BEADS,
  MAX_JETS,
  MAX_RIPPLES,
  pressureStep,
  projectStep,
  quadVertex,
  seedStep,
} from "./shaders.ts";

const PLATE = { width: 1376, height: 768, crown: 902 };
// The sim box in plate pixels: under the surface, from left of the copy to the plate's edge.
const DOMAIN = { x: 392, y: 398, width: 984, height: 256 };
// Where the guide (the moodboard plume, as density) sits in the plate.
const GUIDE = { x: 602, y: 400, width: 600, height: 252 };
const SURFACE = 380;
const FALL = 0.62;
const SETTLED = 6;
const RIPPLE_LIFE = 6;
const STEP = 1 / 30;
const PRESSURE_ITERATIONS = 12;
const DPR_CAP = 1.5;
const PHONE_DPR_CAP = 1;
// The plates hold 1376 pixels across; rendering much denser than that only upsamples them.
const PLATE_DENSITY = 1.3;
const SLOW_FRAME_MS = 20;
const VSYNC_FRAME_MS = 17.5;
const GOVERNOR_FRAMES = 30;
const MIN_QUALITY = 0.5;
// Sim grid long sides; the governor steps down these before it lowers the canvas resolution.
const DESKTOP = { grids: [256, 192, 128], dye: 768 };
const TOUCH = { grids: [128, 96], dye: 512 };
// Vorticity, sink per unit ink, pull up the guide, ambient curl noise (plate px/s²).
const FORCES = [2.6, 70, 900, 95] as const;

export type Water = {
  ready: Promise<void>;
  drop: () => void;
  poke: (x: number, y: number) => void;
  settle: () => void;
  start: () => void;
  stop: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

type Frame = { scale: number; x: number; y: number };
type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};
type Pair = { read: Target; write: Target };
type Jet = {
  x: number;
  y: number;
  speed: number;
  radius: number;
  ink: [number, number];
  start: number;
  life: number;
};
type Program = { program: WebGLProgram; at: (name: string) => WebGLUniformLocation | null };

/** Where the plate sits in a box of css pixels; portrait boxes center the crown below the copy. */
function frameFor(width: number, height: number): Frame {
  if (height > width) {
    const scale = Math.min((2.9 * width) / PLATE.width, (0.72 * height) / PLATE.height);
    return { scale, x: width / 2 - PLATE.crown * scale, y: height - PLATE.height * scale };
  }
  const scale = height / PLATE.height;
  const center = Math.min(width * 0.66, width - 250 * scale);
  return { scale, x: center - PLATE.crown * scale, y: 0 };
}

function link(gl: WebGL2RenderingContext, vertex: WebGLShader, source: string): Program {
  const shader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!shader) throw new Error("shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, shader);
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  gl.deleteShader(shader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "program");
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };
  return { program, at };
}

async function upload(gl: WebGL2RenderingContext, url: string, flip = false) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** Returns null when the browser cannot run the sim in WebGL2, so the caller shows the still. */
export function createWater(
  canvas: HTMLCanvasElement,
  images: { plate: string; clean: string; target: string },
  onLost: () => void,
): Water | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float"))
    return null;

  const programs: Record<string, Program> = {};
  const sources = {
    copy: copyStep,
    seed: seedStep,
    curl: curlStep,
    force: forceStep,
    divergence: divergenceStep,
    pressure: pressureStep,
    project: projectStep,
    advectVelocity: advectVelocityStep,
    advectDye: advectDyeStep,
    dye: dyeStep,
    composite,
  };
  try {
    const vertex = gl.createShader(gl.VERTEX_SHADER);
    if (!vertex) return null;
    gl.shaderSource(vertex, quadVertex);
    gl.compileShader(vertex);
    if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS)) return null;
    for (const [name, source] of Object.entries(sources)) programs[name] = link(gl, vertex, source);
    gl.deleteShader(vertex);
  } catch {
    return null;
  }
  const program = (name: keyof typeof sources) => {
    const p = programs[name];
    if (!p) throw new Error(name);
    gl.useProgram(p.program);
    return p;
  };

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const made: Target[] = [];
  const target = (width: number, height: number): Target => {
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
    const t = { texture, framebuffer, width, height };
    made.push(t);
    return t;
  };
  const release = (t: Target) => {
    gl.deleteTexture(t.texture);
    gl.deleteFramebuffer(t.framebuffer);
    made.splice(made.indexOf(t), 1);
  };
  const pair = (width: number, height: number): Pair => ({
    read: target(width, height),
    write: target(width, height),
  });
  const swap = (p: Pair) => {
    [p.read, p.write] = [p.write, p.read];
  };

  const css0 = { width: canvas.clientWidth, height: canvas.clientHeight };
  const touch = css0.width < 640 || window.matchMedia("(pointer: coarse)").matches;
  const ladder = touch ? TOUCH : DESKTOP;
  const rows = (cols: number) => Math.round((cols * DOMAIN.height) / DOMAIN.width);

  const dye = pair(ladder.dye, rows(ladder.dye));
  const forward = target(ladder.dye, rows(ladder.dye));
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
  let level = 0;
  const grid = (cols: number) => ({
    velocity: pair(cols, rows(cols)),
    pressure: pair(cols, rows(cols)),
    curl: target(cols, rows(cols)),
    divergence: target(cols, rows(cols)),
  });
  let sim = grid(ladder.grids[0] ?? 128);

  let textures: (WebGLTexture | null)[] = [];
  let loaded = false;
  let css = css0;
  let frame = frameFor(css.width, css.height);
  let density = 1;
  let quality = 1;

  let clock = 0;
  let simClock = 0;
  let pending = 0;
  let impact = Number.POSITIVE_INFINITY;
  let motion = 1;
  let ripples: { x: number; start: number; strength: number; radius: number }[] = [];
  let beads: { x: number; y: number; impact: number; size: number }[] = [];
  let jets: Jet[] = [];
  let splashed = false;
  const rippleData = new Float32Array(MAX_RIPPLES * 4);
  const beadData = new Float32Array(MAX_BEADS * 4);
  const jetData = new Float32Array(MAX_JETS * 4);
  const feedData = new Float32Array(MAX_JETS * 4);

  let raf = 0;
  let last = 0;
  let running = false;
  let lost = false;
  let slow = 0;
  let frames = 0;
  let fast = 0;
  let drops = 0;

  const fit = () => {
    const cap = css.width < 640 ? PHONE_DPR_CAP : DPR_CAP;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    density = Math.min(dpr, PLATE_DENSITY / Math.max(frame.scale, 1e-3)) * quality;
    const width = Math.max(1, Math.round(css.width * density));
    const height = Math.max(1, Math.round(css.height * density));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const bind = (
    unit: number,
    texture: WebGLTexture | null,
    location: WebGLUniformLocation | null,
  ) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(location, unit);
  };
  const into = (t: Target | null) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t?.framebuffer ?? null);
    if (t) gl.viewport(0, 0, t.width, t.height);
    else gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
  const shared = (p: Program, cols: Target) => {
    gl.uniform2f(p.at("texel"), 1 / cols.width, 1 / cols.height);
    gl.uniform2f(p.at("cell"), DOMAIN.width / cols.width, DOMAIN.height / cols.height);
    gl.uniform4f(p.at("domain"), DOMAIN.x, DOMAIN.y, DOMAIN.width, DOMAIN.height);
    gl.uniform4f(p.at("guideBox"), GUIDE.x, GUIDE.y, GUIDE.width, GUIDE.height);
  };

  const activeJets = () => {
    jets = jets.filter((j) => clock - j.start < j.life);
    const live = jets.filter((j) => clock >= j.start).slice(-MAX_JETS);
    jetData.fill(0);
    feedData.fill(0);
    live.forEach((j, i) => {
      const t = (clock - j.start) / j.life;
      const envelope = Number.isFinite(j.life) ? (1 - t) ** 2 : 1;
      jetData.set([j.x, j.y, j.speed * envelope, j.radius], i * 4);
      feedData.set([j.ink[0] * envelope, j.ink[1] * envelope, 0, 0], i * 4);
    });
    return live.length;
  };

  const step = () => {
    simClock += STEP;
    const since = clock - impact;
    // The stem keeps feeding in pulses once the splash has landed, so tendrils keep forming.
    const stem = since > 0.5 ? 0.6 + 0.4 * Math.sin(simClock * 2.3) * Math.sin(simClock * 0.71) : 0;
    const count = activeJets();
    if (stem > 0 && count < MAX_JETS) {
      jetData.set([PLATE.crown + 6 * Math.sin(simClock * 0.9), 408, 70 * stem, 9], count * 4);
      feedData.set([0.5 * stem, 0, 0, 0], count * 4);
    }
    const jetCount = Math.min(MAX_JETS, count + (stem > 0 ? 1 : 0));
    const grow = easeOut((since - 0.25) / 3.4);
    const cell = sim.velocity.read;

    let p = program("curl");
    shared(p, cell);
    bind(0, sim.velocity.read.texture, p.at("velocity"));
    into(sim.curl);
    draw();

    p = program("force");
    shared(p, cell);
    bind(0, sim.velocity.read.texture, p.at("velocity"));
    bind(1, sim.curl.texture, p.at("curl"));
    bind(2, dye.read.texture, p.at("dye"));
    bind(3, textures[2] ?? null, p.at("target"));
    gl.uniform1f(p.at("dt"), STEP);
    gl.uniform1f(p.at("time"), simClock);
    gl.uniform4f(p.at("forces"), FORCES[0], FORCES[1], FORCES[2] * grow, FORCES[3]);
    gl.uniform1i(p.at("jetCount"), jetCount);
    gl.uniform4fv(p.at("jets"), jetData);
    into(sim.velocity.write);
    draw();
    swap(sim.velocity);

    p = program("divergence");
    shared(p, cell);
    bind(0, sim.velocity.read.texture, p.at("velocity"));
    into(sim.divergence);
    draw();

    p = program("pressure");
    shared(p, cell);
    bind(1, sim.divergence.texture, p.at("divergence"));
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      bind(0, sim.pressure.read.texture, p.at("pressure"));
      into(sim.pressure.write);
      draw();
      swap(sim.pressure);
    }

    p = program("project");
    shared(p, cell);
    bind(0, sim.velocity.read.texture, p.at("velocity"));
    bind(1, sim.pressure.read.texture, p.at("pressure"));
    into(sim.velocity.write);
    draw();
    swap(sim.velocity);

    p = program("advectVelocity");
    shared(p, cell);
    bind(0, sim.velocity.read.texture, p.at("velocity"));
    gl.uniform1f(p.at("dt"), STEP);
    into(sim.velocity.write);
    draw();
    swap(sim.velocity);

    p = program("advectDye");
    shared(p, cell);
    bind(0, sim.velocity.read.texture, p.at("velocity"));
    bind(1, dye.read.texture, p.at("dye"));
    gl.uniform1f(p.at("dt"), STEP);
    into(forward);
    draw();

    p = program("dye");
    shared(p, cell);
    bind(0, sim.velocity.read.texture, p.at("velocity"));
    bind(1, dye.read.texture, p.at("dye"));
    bind(2, forward.texture, p.at("forward"));
    bind(3, textures[2] ?? null, p.at("target"));
    gl.uniform2f(p.at("dyeTexel"), 1 / dye.read.width, 1 / dye.read.height);
    gl.uniform1f(p.at("dt"), STEP);
    gl.uniform1f(p.at("time"), simClock);
    // grow, fill rate, release rate outside the plume, decay of the reader's ink.
    gl.uniform4f(p.at("guide"), grow, 0.4 + 1.3 * grow, 0.6 + 1.4 * grow, 1 / 16);
    gl.uniform1i(p.at("jetCount"), jetCount);
    gl.uniform4fv(p.at("jets"), jetData);
    gl.uniform4fv(p.at("feeds"), feedData);
    into(dye.write);
    draw();
    swap(dye);
  };

  const render = () => {
    if (!loaded || lost) return;
    into(null);
    const p = program("composite");
    bind(0, textures[0] ?? null, p.at("plate"));
    bind(1, textures[1] ?? null, p.at("clean"));
    bind(2, dye.read.texture, p.at("dyeNow"));
    bind(3, dye.write.texture, p.at("dyeBefore"));
    gl.uniform2f(p.at("resolution"), canvas.width, canvas.height);
    const s = canvas.width / Math.max(css.width, 1);
    gl.uniform3f(p.at("frame"), frame.scale * s, frame.x * s, frame.y * s);
    gl.uniform4f(p.at("domain"), DOMAIN.x, DOMAIN.y, DOMAIN.width, DOMAIN.height);
    gl.uniform2f(p.at("dyeTexel"), 1 / dye.read.width, 1 / dye.read.height);
    gl.uniform1f(p.at("blend"), Math.min(1, pending / STEP));
    gl.uniform1f(p.at("age"), clock - impact);
    gl.uniform1f(p.at("clock"), clock);
    gl.uniform1f(p.at("motion"), motion);
    gl.uniform1f(p.at("lod"), Math.max(0, -Math.log2(frame.scale * s)));
    ripples = ripples.filter((r) => clock - r.start < RIPPLE_LIFE);
    rippleData.fill(0);
    ripples.forEach((r, i) => rippleData.set([r.x, r.start, r.strength, r.radius], i * 4));
    gl.uniform1i(p.at("count"), ripples.length);
    gl.uniform4fv(p.at("ripples"), rippleData);
    beads = beads.filter((b) => b.impact > clock);
    beadData.fill(0);
    beads.forEach((b, i) => beadData.set([b.x, b.y, b.impact, b.size], i * 4));
    gl.uniform1i(p.at("beadCount"), beads.length);
    gl.uniform4fv(p.at("beads"), beadData);
    draw();
  };

  // Rebuilds the sim grid at another size, carrying the flow over so the ink keeps moving.
  const regrid = (next: number) => {
    const old = sim;
    sim = grid(ladder.grids[next] ?? 96);
    const p = program("copy");
    bind(0, old.velocity.read.texture, p.at("source"));
    into(sim.velocity.read);
    draw();
    for (const t of [old.velocity.read, old.velocity.write, old.pressure.read, old.pressure.write])
      release(t);
    release(old.curl);
    release(old.divergence);
    level = next;
  };

  // Lowers the sim grid first, then the canvas resolution, after a slow window; climbs back
  // after ~4s at vsync so a stall while the page loads does not leave the scene soft.
  const govern = (ms: number) => {
    slow += ms;
    frames += 1;
    if (frames < GOVERNOR_FRAMES) return;
    const average = slow / frames;
    slow = 0;
    frames = 0;
    fast = average < VSYNC_FRAME_MS ? fast + 1 : 0;
    if (average > SLOW_FRAME_MS) {
      if (level < ladder.grids.length - 1) regrid(level + 1);
      else if (quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality * 0.8);
        fit();
      } else return;
      drops += 1;
    } else if (fast >= 8 && drops < 3 && (quality < 1 || level > 0)) {
      if (quality < 1) {
        quality = Math.min(1, quality / 0.8);
        fit();
      } else regrid(level - 1);
      fast = 0;
    }
  };

  const splash = (x: number, y: number, at: number, main: boolean) => {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push(
      main
        ? { x, start: at, strength: 2.2, radius: 190 }
        : { x, start: at, strength: 2.4, radius: 20 },
    );
    jets.push(
      main
        ? { x, y: 404, speed: 280, radius: 26, ink: [2.4, 0], start: at, life: 0.7 }
        : { x, y, speed: 230, radius: 12, ink: [0, 13], start: at, life: 0.5 },
    );
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const ms = last ? now - last : 16.7;
    last = now;
    govern(ms);
    const dt = Math.min(ms, 100) / 1000;
    clock += dt;
    if (!splashed && clock >= impact) {
      splashed = true;
      splash(PLATE.crown, 404, impact, true);
    }
    pending += dt;
    for (let n = 0; pending >= STEP && n < 2; n++) {
      step();
      pending -= STEP;
    }
    pending = Math.min(pending, STEP);
    render();
  };

  const onHidden = () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (running && !lost) {
      last = 0;
      raf = requestAnimationFrame(tick);
    }
  };
  document.addEventListener("visibilitychange", onHidden);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    onLost();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  fit();
  const ready = Promise.all([
    upload(gl, images.plate),
    upload(gl, images.clean),
    upload(gl, images.target, true),
  ]).then((t) => {
    textures = t;
    loaded = true;
    render();
  });

  return {
    ready,
    drop: () => {
      if (impact === Number.POSITIVE_INFINITY) impact = clock + FALL;
    },
    // A press drops ink where it lands: above the water it falls and splashes in, below
    // the surface it blooms where the pointer is.
    poke: (x, y) => {
      const px = Math.min(
        DOMAIN.x + DOMAIN.width - 24,
        Math.max(DOMAIN.x + 24, (x - frame.x) / frame.scale),
      );
      const py = (y - frame.y) / frame.scale;
      if (py < SURFACE) {
        const fall = Math.max(0.12, Math.sqrt((SURFACE - Math.max(py, SURFACE - 420)) / 1300));
        if (beads.length >= MAX_BEADS) beads.shift();
        beads.push({ x: px, y: SURFACE, impact: clock + fall, size: 8 });
        splash(px, 410, clock + fall, false);
      } else {
        splash(px, Math.min(py, DOMAIN.y + DOMAIN.height - 30), clock, false);
        const ring = ripples[ripples.length - 1];
        if (ring) ring.strength = 0.8;
      }
    },
    settle: () => {
      motion = 0;
      impact = -SETTLED;
      splashed = true;
      clock = 0;
      const p = program("seed");
      shared(p, dye.read);
      bind(0, textures[2] ?? null, p.at("target"));
      for (const t of [dye.read, dye.write]) {
        into(t);
        draw();
      }
      render();
    },
    start: () => {
      if (running || lost) return;
      running = true;
      last = 0;
      if (!document.hidden) raf = requestAnimationFrame(tick);
    },
    stop: () => {
      running = false;
      cancelAnimationFrame(raf);
    },
    resize: (width, height) => {
      css = { width, height };
      frame = frameFor(width, height);
      fit();
      render();
    },
    dispose: () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onHidden);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      for (const t of textures) gl.deleteTexture(t);
      for (const t of made.splice(0)) {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.framebuffer);
      }
      gl.deleteBuffer(quad);
      for (const p of Object.values(programs)) gl.deleteProgram(p.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
