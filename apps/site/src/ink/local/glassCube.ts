import { createCards } from "./cards.ts";
import { link, seeded } from "./gl.ts";
import { fragmentSource, vertexSource } from "./shader.ts";
import { createSim, DROPS } from "./sim.ts";

const NOISE_SIZE = 32;
const BASE_YAW = -Math.PI / 4;
const TARGET_URL = "/media/ink/local/ink-target.webp";
const SIM_DT = 1 / 30;
const WARM_STEPS = 45;
const CALM_STEPS = 150;
const STEPS_PER_FRAME = 5;
// The governor drops the sim grid first, then canvas resolution; the browser upscales the canvas.
const QUALITY = [
  { grid: 176, scale: 1 },
  { grid: 144, scale: 1 },
  { grid: 128, scale: 0.9 },
  { grid: 128, scale: 0.78 },
  { grid: 128, scale: 0.66 },
  { grid: 128, scale: 0.55 },
] as const;
const BUDGET_MS = 20;
const SAMPLE_FRAMES = 30;
const MAX_PIXELS = 1_500_000;
const EYE = [0, 1.5, 18] as const;

export type GlassCube = {
  drag: (dx: number, dy: number) => void;
  release: () => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};

function rotation(yaw: number, pitch: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Column-major: yaw about Y, then pitch about X.
  return new Float32Array([cy, sy * sp, -sy * cp, 0, cp, sp, sy, -cy * sp, cy * cp]);
}

function camera() {
  const normalize = (v: number[]) => {
    const length = Math.hypot(...v);
    return v.map((x) => x / length);
  };
  const cross = (a: number[], b: number[]) => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
  const forward = normalize([-EYE[0], -0.02 - EYE[1], -EYE[2]]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { eye: [...EYE], forward, right, up };
}

type Drop = { x: number; y: number; age: number; life: number; lane: number };

type Options = { calm: boolean; onReady: () => void; onLost: () => void };

export function createGlassCube(canvas: HTMLCanvasElement, options: Options): GlassCube | null {
  const { calm } = options;
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
  const shader = link(gl, vertexSource, fragmentSource);
  if (!shader) return null;

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const random = seeded(7);
  const noise = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, noise);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const voxels = new Uint8Array(NOISE_SIZE ** 3).map(() => Math.floor(random() * 256));
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.R8,
    NOISE_SIZE,
    NOISE_SIZE,
    NOISE_SIZE,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    voxels,
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
    gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);

  const goal = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, goal);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const governor = { level: coarse ? 2 : 0, total: 0, count: 0 };
  const sim = createSim(gl, noise, goal, QUALITY[governor.level]!.grid);
  const cards = createCards(gl);
  if (!sim || !cards) {
    sim?.dispose();
    cards?.dispose();
    return null;
  }

  shader.use();
  gl.uniform1i(shader.uniform("uNoise"), 0);
  gl.uniform1i(shader.uniform("uDye"), 1);
  gl.uniform1i(shader.uniform("uCards"), 2);
  const base = rotation(BASE_YAW, 0);
  const axis = [base[0]!, base[3]!, base[6]!] as const;
  const normal = [base[2]!, base[5]!, base[8]!] as const;
  gl.uniform3f(shader.uniform("uPlateNormal"), ...normal);
  gl.uniform3f(shader.uniform("uPlateAxis"), ...axis);
  const view = camera();

  const drag = { yaw: 0, pitch: 0, held: false };
  const eased = { yaw: 0, pitch: 0 };
  const box = {
    width: 1,
    height: 1,
    dpr: Math.min(coarse ? 1 : 1.5, window.devicePixelRatio || 1),
  };
  const drops: Drop[] = [];
  const dropUniform = new Float32Array(DROPS * 4);
  const pour = seeded(41);
  let nextDrop = 0.6;
  let simTime = 0;
  let pending = 0;
  let warmed = 0;
  let slosh = 0;
  let lastYaw = 0;
  let loaded = false;
  let disposed = false;
  let visible = false;
  let pageShown = document.visibilityState === "visible";
  let frame = 0;
  let last = 0;
  let clock = 0;

  const fit = () => {
    let dpr = box.dpr * (QUALITY[governor.level]?.scale ?? 1);
    const pixels = box.width * box.height * dpr * dpr;
    if (pixels > MAX_PIXELS) dpr *= Math.sqrt(MAX_PIXELS / pixels);
    const width = Math.max(1, Math.round(box.width * dpr));
    const height = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
  };

  // Drops fall from just under the surface where the board's ink is heaviest, so fresh plumes feed the composition.
  const pourDrops = () => {
    if (simTime >= nextDrop && drops.length < DROPS) {
      const spots = [0.3, 0.42, 0.6, 0.68, 0.16, 0.86];
      const spot = spots[Math.floor(pour() * spots.length)] ?? 0.5;
      const pick = pour();
      drops.push({
        x: spot + (pour() - 0.5) * 0.06,
        y: 0.97,
        age: 0,
        life: 1.4 + pour() * 0.8,
        lane: pick < 0.55 ? 0 : pick < 0.75 ? 1 : 2,
      });
      nextDrop = simTime + 1.6 + pour() * 2.4;
    }
    dropUniform.fill(0);
    drops.forEach((drop, index) => {
      drop.age += SIM_DT;
      drop.y -= SIM_DT * 0.16;
      const strength = Math.sin((Math.PI * Math.min(drop.age, drop.life)) / drop.life);
      dropUniform.set([drop.x, drop.y, strength, drop.lane], index * 4);
    });
    for (let i = drops.length - 1; i >= 0; i--)
      if (drops[i]!.age >= drops[i]!.life) drops.splice(i, 1);
  };

  const simulate = () => {
    pourDrops();
    gl.bindVertexArray(quad);
    sim.step({ dt: SIM_DT, time: simTime, drops: dropUniform, slosh });
    const [tx, ty] = sim.texel();
    cards.step(sim.velocity(), [tx, ty], 2.7 / sim.grid(), SIM_DT, simTime);
    simTime += SIM_DT;
  };

  const draw = () => {
    if (!loaded) return;
    fit();
    const yaw = BASE_YAW + Math.sin(clock * 0.07) * 0.05 + eased.yaw;
    const turn = rotation(yaw, eased.pitch);
    const scale = Math.min(canvas.height, canvas.width * 0.9);
    cards.draw({
      rotation: turn,
      axis,
      normal,
      ...view,
      width: canvas.width,
      height: canvas.height,
      scale,
      lead: calm ? 0 : pending,
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindVertexArray(quad);
    shader.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, noise);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sim.dye());
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, cards.texture());
    gl.uniform2f(shader.uniform("uResolution"), canvas.width, canvas.height);
    gl.uniform1f(shader.uniform("uTime"), simTime + pending);
    gl.uniform2f(shader.uniform("uDyeTexel"), ...sim.dyeTexel());
    gl.uniformMatrix3fv(shader.uniform("uRotation"), false, turn);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const govern = (ms: number) => {
    if (ms > 100 || governor.level >= QUALITY.length - 1) return;
    governor.total += ms;
    governor.count += 1;
    if (governor.count < SAMPLE_FRAMES) return;
    if (governor.total / governor.count > BUDGET_MS) {
      governor.level += 1;
      sim.resize(QUALITY[governor.level]!.grid);
    }
    governor.total = 0;
    governor.count = 0;
  };

  // Warm-up runs a few steps per frame so the first visible frame already holds developed ink.
  const warm = (goalSteps: number) => {
    for (let i = 0; i < STEPS_PER_FRAME && warmed < goalSteps; i++, warmed++) simulate();
    return warmed >= goalSteps;
  };

  const tick = (now: number) => {
    frame = 0;
    const ms = last ? now - last : 0;
    const step = Math.min(0.05, ms / 1000);
    last = now;
    if (calm) {
      if (!warm(CALM_STEPS)) {
        frame = requestAnimationFrame(tick);
        return;
      }
      draw();
      options.onReady();
      return;
    }
    if (!warm(WARM_STEPS)) {
      frame = requestAnimationFrame(tick);
      return;
    }
    if (ms) govern(ms);
    clock += step;
    if (!drag.held) {
      drag.yaw *= Math.exp(-step * 0.8);
      drag.pitch *= Math.exp(-step * 0.8);
    }
    const follow = 1 - Math.exp(-step * 6);
    eased.yaw += (drag.yaw - eased.yaw) * follow;
    eased.pitch += (drag.pitch - eased.pitch) * follow;
    if (step > 0) {
      const spin = (eased.yaw - lastYaw) / step;
      slosh += (-spin * 0.8 - slosh) * (1 - Math.exp(-step * 4));
    }
    lastYaw = eased.yaw;
    pending += step;
    for (let i = 0; i < 2 && pending >= SIM_DT; i++) {
      pending -= SIM_DT;
      simulate();
    }
    pending = Math.min(pending, SIM_DT);
    draw();
    if (warmed === WARM_STEPS) {
      warmed += 1;
      options.onReady();
    }
    frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const sync = () => {
    const warming = calm && warmed < CALM_STEPS;
    if (!loaded || !pageShown || (!visible && !warming) || (calm && !warming)) return stop();
    if (frame) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };

  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    box.width = entry.contentRect.width;
    box.height = entry.contentRect.height;
    if (!frame) draw();
  });
  resizeObserver.observe(canvas);

  const onPage = () => {
    pageShown = document.visibilityState === "visible";
    sync();
  };
  document.addEventListener("visibilitychange", onPage);

  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    if (disposed) return;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, goal);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindVertexArray(quad);
    sim.seed(0.8);
    loaded = true;
    sync();
  };
  image.src = TARGET_URL;

  const onLost = (event: Event) => {
    event.preventDefault();
    stop();
    visible = false;
    options.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  return {
    drag: (dx, dy) => {
      drag.held = true;
      drag.yaw = Math.max(-0.3, Math.min(0.3, drag.yaw + dx * 0.004));
      drag.pitch = Math.max(-0.08, Math.min(0.08, drag.pitch + dy * 0.0015));
      if (calm) {
        eased.yaw = drag.yaw;
        eased.pitch = drag.pitch;
        draw();
      }
    },
    release: () => {
      drag.held = false;
    },
    setVisible: (next) => {
      visible = next;
      sync();
    },
    dispose: () => {
      disposed = true;
      image.onload = null;
      stop();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onPage);
      canvas.removeEventListener("webglcontextlost", onLost);
      sim.dispose();
      cards.dispose();
      gl.deleteTexture(goal);
      gl.deleteTexture(noise);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(quad);
      gl.deleteProgram(shader.handle);
    },
  };
}
