import { CARD_COUNT, fragmentSource, vertexSource } from "./shader.ts";

const NOISE_SIZE = 48;
const MAX_DPR = 1.5;
const MAX_PIXELS = 900_000;
const STILL_TIME = 38;

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

function program(gl: WebGL2RenderingContext) {
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

type Card = {
  x: number;
  y: number;
  z: number;
  spin: number;
  tilt: number;
  speed: number;
  sway: number;
};

function makeCards() {
  const random = seeded(23);
  return Array.from({ length: CARD_COUNT }, (): Card => ({
    x: (random() * 2 - 1) * 0.72,
    y: random(),
    z: (random() * 2 - 1) * 0.72,
    spin: random() * Math.PI * 2,
    tilt: random() * Math.PI * 2,
    speed: 0.6 + random() * 0.8,
    sway: random() * Math.PI * 2,
  }));
}

const WATER_TOP = 0.62;
const WATER_BOTTOM = -0.9;

function cardFrame(cards: Card[], time: number, out: Float32Array) {
  cards.forEach((card, index) => {
    const fall = (card.y + time * 0.006 * card.speed) % 1;
    const y = WATER_TOP - fall * (WATER_TOP - WATER_BOTTOM);
    const x = card.x + Math.sin(time * 0.11 * card.speed + card.sway) * 0.12;
    const z = card.z + Math.cos(time * 0.09 * card.speed + card.sway) * 0.12;
    const a = card.spin + time * 0.21 * card.speed;
    const b = card.tilt + time * 0.17;
    const u = [Math.cos(a) * 0.075, Math.sin(b) * 0.025, Math.sin(a) * 0.075];
    const v = [
      -Math.sin(a) * Math.cos(b) * 0.052,
      Math.cos(b) * 0.052,
      Math.cos(a) * Math.cos(b) * 0.052,
    ];
    out.set([x, y, z, ...u, ...v], index * 9);
  });
}

function rotation(yaw: number, pitch: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Column-major: yaw about Y, then pitch about X.
  return new Float32Array([cy, sy * sp, -sy * cp, 0, cp, sp, sy, -cy * sp, cy * cp]);
}

export function createGlassCube(canvas: HTMLCanvasElement, calm: boolean): GlassCube | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  const shader = program(gl);
  if (!shader) return null;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, texture);
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

  gl.useProgram(shader);
  const uniform = (name: string) => gl.getUniformLocation(shader, name);
  const uResolution = uniform("uResolution");
  const uTime = uniform("uTime");
  const uRotation = uniform("uRotation");
  const uCards = uniform("uCards");
  gl.uniform1i(uniform("uNoise"), 0);

  const cards = makeCards();
  const cardData = new Float32Array(CARD_COUNT * 9);
  const drag = { yaw: 0, pitch: 0, held: false };
  const eased = { yaw: 0, pitch: 0 };
  let visible = false;
  let frame = 0;
  let last = 0;
  let clock = STILL_TIME;

  const resize = () => {
    const box = canvas.getBoundingClientRect();
    let dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
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
    resize();
    const yaw = -0.62 + clock * 0.045 + eased.yaw;
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTime, clock);
    gl.uniformMatrix3fv(uRotation, false, rotation(yaw, eased.pitch));
    cardFrame(cards, clock, cardData);
    gl.uniform3fv(uCards, cardData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const tick = (now: number) => {
    frame = 0;
    const step = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    clock += step;
    if (!drag.held) {
      drag.yaw *= Math.exp(-step * 0.8);
      drag.pitch *= Math.exp(-step * 0.8);
    }
    const follow = 1 - Math.exp(-step * 6);
    eased.yaw += (drag.yaw - eased.yaw) * follow;
    eased.pitch += (drag.pitch - eased.pitch) * follow;
    draw();
    if (visible) frame = requestAnimationFrame(tick);
  };

  const start = () => {
    if (frame || calm) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };

  const resizeObserver = new ResizeObserver(() => {
    if (calm || !visible) draw();
  });
  resizeObserver.observe(canvas);

  const onLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    visible = false;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  draw();

  return {
    drag: (dx, dy) => {
      drag.held = true;
      drag.yaw = Math.max(-0.6, Math.min(0.6, drag.yaw + dx * 0.006));
      drag.pitch = Math.max(-0.12, Math.min(0.12, drag.pitch + dy * 0.002));
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
      if (next) start();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(shader);
    },
  };
}
