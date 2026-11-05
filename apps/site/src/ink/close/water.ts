import { composite, MAX_RIPPLES, quadVertex } from "./shaders.ts";

const PLATE = { width: 1376, height: 768, crown: 902 };
const FALL = 0.62;
const SETTLED = 6;
const RIPPLE_LIFE = 6;
const DPR_CAP = 1.5;
const PHONE_DPR_CAP = 1;
// The plates hold 1376 pixels across; rendering much denser than that only upsamples them.
const PLATE_DENSITY = 1.3;
const SLOW_FRAME_MS = 20;
const VSYNC_FRAME_MS = 17.5;
const GOVERNOR_FRAMES = 30;
const MIN_QUALITY = 0.5;

export type Water = {
  ready: Promise<void>;
  drop: () => void;
  ripple: (x: number) => void;
  settle: () => void;
  start: () => void;
  stop: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

type Frame = { scale: number; x: number; y: number };

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

function compile(gl: WebGL2RenderingContext) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, quadVertex],
    [gl.FRAGMENT_SHADER, composite],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "program");
  const at = (name: string) => gl.getUniformLocation(program, name);
  return {
    program,
    plate: at("plate"),
    clean: at("clean"),
    resolution: at("resolution"),
    frame: at("frame"),
    age: at("age"),
    clock: at("clock"),
    motion: at("motion"),
    lod: at("lod"),
    count: at("count"),
    ripples: at("ripples"),
  };
}

async function upload(gl: WebGL2RenderingContext, url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/** Returns null when the browser cannot run WebGL2, so the caller shows the still. */
export function createWater(
  canvas: HTMLCanvasElement,
  images: { plate: string; clean: string },
  onLost: () => void,
): Water | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  let shader: ReturnType<typeof compile>;
  try {
    shader = compile(gl);
  } catch {
    return null;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let textures: (WebGLTexture | null)[] = [];
  let loaded = false;
  let css = { width: canvas.clientWidth, height: canvas.clientHeight };
  let frame = frameFor(css.width, css.height);
  let density = 1;
  let quality = 1;

  let clock = 0;
  let impact = Number.POSITIVE_INFINITY;
  let motion = 1;
  let ripples: { x: number; start: number; strength: number; radius: number }[] = [];
  let splashed = false;
  const rippleData = new Float32Array(MAX_RIPPLES * 4);

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

  const render = () => {
    if (!loaded || lost) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(shader.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[0] ?? null);
    gl.uniform1i(shader.plate, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures[1] ?? null);
    gl.uniform1i(shader.clean, 1);
    gl.uniform2f(shader.resolution, canvas.width, canvas.height);
    const s = canvas.width / Math.max(css.width, 1);
    gl.uniform3f(shader.frame, frame.scale * s, frame.x * s, frame.y * s);
    gl.uniform1f(shader.age, clock - impact);
    gl.uniform1f(shader.clock, clock);
    gl.uniform1f(shader.motion, motion);
    gl.uniform1f(shader.lod, Math.max(0, -Math.log2(frame.scale * s)));
    ripples = ripples.filter((r) => clock - r.start < RIPPLE_LIFE);
    rippleData.fill(0);
    ripples.forEach((r, i) => rippleData.set([r.x, r.start, r.strength, r.radius], i * 4));
    gl.uniform1i(shader.count, ripples.length);
    gl.uniform4fv(shader.ripples, rippleData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Steps resolution down after a slow window and back up after ~4s at vsync, so a stall
  // while the page loads does not leave the scene soft; it stops climbing if it keeps falling.
  const govern = (ms: number) => {
    slow += ms;
    frames += 1;
    if (frames < GOVERNOR_FRAMES) return;
    const average = slow / frames;
    slow = 0;
    frames = 0;
    fast = average < VSYNC_FRAME_MS ? fast + 1 : 0;
    if (average > SLOW_FRAME_MS && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality * 0.8);
      drops += 1;
      fit();
    } else if (fast >= 8 && quality < 1 && drops < 3) {
      quality = Math.min(1, quality / 0.8);
      fast = 0;
      fit();
    }
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const ms = last ? now - last : 16.7;
    last = now;
    govern(ms);
    clock += Math.min(ms, 100) / 1000;
    if (!splashed && clock >= impact) {
      splashed = true;
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({ x: PLATE.crown, start: impact, strength: 2.2, radius: 190 });
    }
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
  const ready = Promise.all([upload(gl, images.plate), upload(gl, images.clean)]).then((t) => {
    textures = t;
    loaded = true;
    render();
  });

  return {
    ready,
    drop: () => {
      if (impact === Number.POSITIVE_INFINITY) impact = clock + FALL;
    },
    ripple: (x) => {
      const px = (x - frame.x) / frame.scale;
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({ x: px, start: clock, strength: 3, radius: 20 });
    },
    settle: () => {
      motion = 0;
      impact = -SETTLED;
      splashed = true;
      clock = 0;
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
      gl.deleteBuffer(quad);
      gl.deleteProgram(shader.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
