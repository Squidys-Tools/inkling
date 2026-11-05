import { fragmentSource, vertexSource } from "./shader.ts";
import { frame as still } from "./timeline.ts";

export type DevelopFrame = {
  time: number;
  width: number;
  height: number;
  scale: number;
  rect: { x: number; y: number; scale: number };
  form: number;
  bloom: number;
};

const uniformNames = [
  "uResolution",
  "uFrame",
  "uTime",
  "uForm",
  "uBloom",
  "uCell",
  "uReady",
  "uStill",
  "uMask",
  "uFlow",
] as const;

const flowSize = 128;
const dotPitch = 6.5;

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

/** Draws the develop scene onto `canvas`, or returns null where WebGL2 or the shader is unavailable. */
export function createDevelopRenderer(
  canvas: HTMLCanvasElement,
  sources: { still: string; mask: string },
) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
  if (!gl || gl.isContextLost()) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = Object.fromEntries(
    uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Record<(typeof uniformNames)[number], WebGLUniformLocation | null>;

  const texture = (unit: number, wrap: number) => {
    const handle = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return handle;
  };

  const photo = texture(0, gl.CLAMP_TO_EDGE);
  const mask = texture(1, gl.CLAMP_TO_EDGE);
  const flow = texture(2, gl.REPEAT);
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

  let pending = 2;
  let disposed = false;
  const load = (src: string, unit: number, handle: WebGLTexture, mipmaps: boolean) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (disposed || gl.isContextLost()) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      if (mipmaps) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      }
      pending -= 1;
    };
    image.src = src;
  };
  load(sources.still, 0, photo, true);
  load(sources.mask, 1, mask, false);

  gl.uniform1i(uniforms.uStill, 0);
  gl.uniform1i(uniforms.uMask, 1);
  gl.uniform1i(uniforms.uFlow, 2);

  return {
    get ready() {
      return pending === 0;
    },
    draw(frame: DevelopFrame) {
      const width = Math.max(1, Math.round(frame.width * frame.scale));
      const height = Math.max(1, Math.round(frame.height * frame.scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ratio = width / frame.width;
      const { x, y, scale } = frame.rect;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.uResolution, width, height);
      gl.uniform4f(
        uniforms.uFrame,
        x * ratio,
        y * ratio,
        still.width * scale * ratio,
        still.height * scale * ratio,
      );
      gl.uniform1f(uniforms.uTime, frame.time);
      gl.uniform1f(uniforms.uForm, frame.form);
      gl.uniform1f(uniforms.uBloom, frame.bloom);
      gl.uniform1f(uniforms.uCell, Math.max(4.5 * ratio, dotPitch * scale * ratio));
      gl.uniform1f(uniforms.uReady, pending === 0 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      disposed = true;
      for (const handle of [photo, mask, flow]) gl.deleteTexture(handle);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}
