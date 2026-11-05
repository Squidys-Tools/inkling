import { fragmentSource, vertexSource } from "./shader.ts";

const NOISE_SIZE = 48;
const STILL_TIME = 38;
const BASE_YAW = -Math.PI / 4;
const PLATE_URL = "/media/ink/local/plate.webp";
// Resolution scale per governor step; the browser upscales the canvas.
const QUALITY = [1, 0.85, 0.72, 0.6, 0.5] as const;
const BUDGET_MS = 20;
const SAMPLE_FRAMES = 30;
const MAX_PIXELS = 1_500_000;

export type GlassCube = {
  drag: (dx: number, dy: number) => void;
  release: () => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};

function compile(gl: WebGL2RenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGL2RenderingContext, fragmentSource: string) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const linked = gl.createProgram();
  gl.attachShader(linked, vertex);
  gl.attachShader(linked, fragment);
  gl.bindAttribLocation(linked, 0, "aPosition");
  gl.linkProgram(linked);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return gl.getProgramParameter(linked, gl.LINK_STATUS) ? linked : null;
}

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Tileable value noise, smoothed once and equalized to a flat histogram, so the shader's fbm is three hardware-filtered fetches.
function noiseVolume() {
  const n = NOISE_SIZE;
  const random = seeded(7);
  const raw = new Float32Array(n * n * n).map(() => random());
  const at = (x: number, y: number, z: number) =>
    raw[((z + n) % n) * n * n + ((y + n) % n) * n + ((x + n) % n)] ?? 0;
  const out = new Float32Array(n * n * n);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let sum = 0;
        for (let k = -1; k <= 1; k++)
          for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) sum += at(x + i, y + j, z + k) * (k || j || i ? 1 : 4);
        out[z * n * n + y * n + x] = sum;
      }
  const order = Array.from(out.keys()).sort((a, b) => (out[a] ?? 0) - (out[b] ?? 0));
  const equalized = new Uint8Array(out.length);
  order.forEach((index, rank) => {
    equalized[index] = Math.floor((rank / order.length) * 256);
  });
  return equalized;
}

function rotation(yaw: number, pitch: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Column-major: yaw about Y, then pitch about X.
  return new Float32Array([cy, sy * sp, -sy * cp, 0, cp, sp, sy, -cy * sp, cy * cp]);
}

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
  if (!gl) return null;
  const shader = link(gl, fragmentSource);
  if (!shader) return null;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const noise = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, noise);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
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
    noiseVolume(),
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
    gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);

  const plateTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, plateTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.useProgram(shader);
  const uniform = (name: string) => gl.getUniformLocation(shader, name);
  const uResolution = uniform("uResolution");
  const uTime = uniform("uTime");
  const uRotation = uniform("uRotation");
  gl.uniform1i(uniform("uNoise"), 0);
  gl.uniform1i(uniform("uPlate"), 1);
  const base = rotation(BASE_YAW, 0);
  gl.uniform3f(uniform("uPlateNormal"), base[2]!, base[5]!, base[8]!);
  gl.uniform3f(uniform("uPlateAxis"), base[0]!, base[3]!, base[6]!);

  const drag = { yaw: 0, pitch: 0, held: false };
  const eased = { yaw: 0, pitch: 0 };
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const box = {
    width: 1,
    height: 1,
    dpr: Math.min(coarse ? 1 : 1.5, window.devicePixelRatio || 1),
  };
  const governor = { level: 0, total: 0, count: 0 };
  let loaded = false;
  let disposed = false;
  let visible = false;
  let pageShown = document.visibilityState === "visible";
  let frame = 0;
  let last = 0;
  let clock = STILL_TIME;

  const fit = () => {
    let dpr = box.dpr * (QUALITY[governor.level] ?? 1);
    const pixels = box.width * box.height * dpr * dpr;
    if (pixels > MAX_PIXELS) dpr *= Math.sqrt(MAX_PIXELS / pixels);
    const width = Math.max(1, Math.round(box.width * dpr));
    const height = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  };

  const draw = () => {
    if (!loaded) return;
    fit();
    const yaw = BASE_YAW + Math.sin((clock - STILL_TIME) * 0.07) * 0.05 + eased.yaw;
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTime, clock);
    gl.uniformMatrix3fv(uRotation, false, rotation(yaw, eased.pitch));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const govern = (ms: number) => {
    if (ms > 100 || governor.level >= QUALITY.length - 1) return;
    governor.total += ms;
    governor.count += 1;
    if (governor.count < SAMPLE_FRAMES) return;
    if (governor.total / governor.count > BUDGET_MS) governor.level += 1;
    governor.total = 0;
    governor.count = 0;
  };

  const tick = (now: number) => {
    frame = 0;
    const ms = last ? now - last : 0;
    const step = Math.min(0.05, ms / 1000);
    last = now;
    if (ms) govern(ms);
    clock += step;
    if (!drag.held) {
      drag.yaw *= Math.exp(-step * 0.8);
      drag.pitch *= Math.exp(-step * 0.8);
    }
    const follow = 1 - Math.exp(-step * 6);
    eased.yaw += (drag.yaw - eased.yaw) * follow;
    eased.pitch += (drag.pitch - eased.pitch) * follow;
    draw();
    frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const sync = () => {
    if (calm || !loaded || !visible || !pageShown) return stop();
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
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    loaded = true;
    draw();
    options.onReady();
    sync();
  };
  image.src = PLATE_URL;

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
      gl.deleteTexture(plateTexture);
      gl.deleteTexture(noise);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(shader);
    },
  };
}
