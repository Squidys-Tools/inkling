import type { CoverScene, Mosaic, Rgb } from "./cardFx.ts";

const CELL_COLUMNS = 9;
const CELL_ROWS = 12;
const RING_BLOBS = 9;
const CELL_FLOATS = CELL_COLUMNS * CELL_ROWS * 4;

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

// Line-by-line port of shadeCover in cardFx.ts: same pixel centres, same 3x3
// neighbour order, same smooth() and alpha/blend maths, premultiplied output.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uSize;
uniform float uBottom;
uniform float uAspect;
uniform float uStretchX;
uniform float uStretchY;
uniform bool uIdle;
uniform sampler2D uCells;
uniform sampler2D uColors;
uniform vec3 uRings[9];
uniform int uRingCount;
uniform vec3 uBaseInk;
uniform vec3 uRingInk;

out vec4 outColor;

float ramp(float low, float high, float value) {
  float amount = clamp((value - low) / (high - low), 0.0, 1.0);
  return amount * amount * (3.0 - 2.0 * amount);
}

void main() {
  // Pixel row/column come from the fragment coordinate so the cell lookup below
  // is exact: fp division can land a cellY that is mathematically an integer a
  // hair below it, which would flip floor() and swap the whole 3x3 neighbour set.
  int cardColumn = int(gl_FragCoord.x);
  int cardRow = int(floor(uSize.y + uBottom - gl_FragCoord.y));
  vec2 pixel = vec2(
    (float(cardColumn) + 0.5) / uSize.x,
    (float(cardRow) + 0.5) / uSize.y
  );
  float cellX = pixel.x * 9.0;
  float cellY = pixel.y * 12.0;
  int baseColumn = ((cardColumn * 2 + 1) * 9) / (int(uSize.x) * 2);
  int baseRow = ((cardRow * 2 + 1) * 6) / int(uSize.y);
  float weight = 0.0;
  vec3 shade = vec3(0.0);
  if (!uIdle) {
    for (int dy = -1; dy <= 1; dy++) {
      int neighborRow = baseRow + dy;
      if (neighborRow < 0 || neighborRow >= 12) continue;
      for (int dx = -1; dx <= 1; dx++) {
        int neighborColumn = baseColumn + dx;
        if (neighborColumn < 0 || neighborColumn >= 9) continue;
        vec4 cell = texelFetch(uCells, ivec2(neighborColumn, neighborRow), 0);
        float size = cell.z;
        if (size == 0.0) continue;
        float offsetX = (cellX - cell.x) * uStretchX;
        float offsetY = (cellY - cell.y) * uStretchY;
        float share = (size * size) / (offsetX * offsetX + offsetY * offsetY + 0.02);
        vec3 tint = texelFetch(uColors, ivec2(neighborColumn, neighborRow), 0).rgb;
        weight += share;
        shade += tint * share;
      }
    }
  }
  float mosaicAlpha = ramp(0.7, 1.05, weight);
  vec3 rgb = weight > 0.0 ? shade / weight : vec3(0.0);
  float baseAlpha = texelFetch(uCells, ivec2(baseColumn, baseRow), 0).w;
  float alpha = mosaicAlpha + baseAlpha * (1.0 - mosaicAlpha);
  vec3 outRgb = alpha > 0.0
    ? (rgb * mosaicAlpha + uBaseInk * baseAlpha * (1.0 - mosaicAlpha)) / alpha
    : vec3(0.0);
  if (uRingCount > 0) {
    float reach = pixel.x * uAspect;
    float field = 0.0;
    for (int index = 0; index < uRingCount; index++) {
      vec3 blob = uRings[index];
      float dx = reach - blob.x;
      float dy = pixel.y - blob.y;
      field += (blob.z * blob.z) / (dx * dx + dy * dy + 1e-4);
    }
    float inkAlpha = ramp(0.9, 1.1, field);
    float total = inkAlpha + alpha * (1.0 - inkAlpha);
    outRgb = total > 0.0
      ? (uRingInk * inkAlpha + outRgb * alpha * (1.0 - inkAlpha)) / total
      : vec3(0.0);
    alpha = total;
  }
  outColor = vec4(outRgb / 255.0 * alpha, alpha);
}`;

type Gpu = {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  cells: WebGLTexture;
  colors: WebGLTexture;
  uSize: WebGLUniformLocation | null;
  uBottom: WebGLUniformLocation | null;
  uAspect: WebGLUniformLocation | null;
  uStretchX: WebGLUniformLocation | null;
  uStretchY: WebGLUniformLocation | null;
  uIdle: WebGLUniformLocation | null;
  uRings: WebGLUniformLocation | null;
  uRingCount: WebGLUniformLocation | null;
  uBaseInk: WebGLUniformLocation | null;
  uRingInk: WebGLUniformLocation | null;
};

// One shared context for the whole document: Chromium caps live WebGL contexts
// (~16) and drops the oldest, so cards share this renderer instead of owning one.
let gpu: Gpu | null = null;
let gpuBroken = false;

const cellsData = new Float32Array(CELL_FLOATS);
const colorsData = new Float32Array(CELL_FLOATS);
const ringData = new Float32Array(RING_BLOBS * 3);

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
};

const cellTexture = (gl: WebGL2RenderingContext) => {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, CELL_COLUMNS, CELL_ROWS, 0, gl.RGBA, gl.FLOAT, null);
  return texture;
};

const createGpu = (): Gpu | null => {
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true });
  if (!gl) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const cells = cellTexture(gl);
  const colors = cellTexture(gl);
  if (!cells || !colors || gl.getError() !== gl.NO_ERROR) return null;
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "uCells"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "uColors"), 1);
  canvas.addEventListener("webglcontextlost", () => {
    if (gpu?.canvas === canvas) gpu = null;
  });
  return {
    canvas,
    gl,
    cells,
    colors,
    uSize: gl.getUniformLocation(program, "uSize"),
    uBottom: gl.getUniformLocation(program, "uBottom"),
    uAspect: gl.getUniformLocation(program, "uAspect"),
    uStretchX: gl.getUniformLocation(program, "uStretchX"),
    uStretchY: gl.getUniformLocation(program, "uStretchY"),
    uIdle: gl.getUniformLocation(program, "uIdle"),
    uRings: gl.getUniformLocation(program, "uRings[0]"),
    uRingCount: gl.getUniformLocation(program, "uRingCount"),
    uBaseInk: gl.getUniformLocation(program, "uBaseInk"),
    uRingInk: gl.getUniformLocation(program, "uRingInk"),
  };
};

/**
 * Draws one cover frame on the GPU into `context`'s canvas. Returns false when
 * WebGL2 is unavailable or the canvas size does not match the mosaic, leaving
 * the caller to run the CPU path.
 */
export function drawCoverGpu(
  context: CanvasRenderingContext2D,
  mosaic: Mosaic,
  scene: CoverScene,
  inks: { base: Rgb; ring: Rgb },
): boolean {
  const width = mosaic.width;
  const height = mosaic.height;
  if (
    gpuBroken ||
    typeof OffscreenCanvas === "undefined" ||
    context.canvas.width !== width ||
    context.canvas.height !== height
  ) {
    return false;
  }
  if (gpu === null) {
    gpu = createGpu();
    if (gpu === null) {
      gpuBroken = true;
      return false;
    }
  }
  const { gl } = gpu;
  // Between a context loss and its event every draw is a no-op that would copy a blank cover.
  if (gl.isContextLost()) return false;
  const target = gpu.canvas;
  if (target.width < width) target.width = width;
  if (target.height < height) target.height = height;
  cellsData.set(scene.cells);
  for (let cell = 0; cell < CELL_COLUMNS * CELL_ROWS; cell++) {
    const from = cell * 3;
    const to = cell * 4;
    colorsData[to] = scene.colors[from];
    colorsData[to + 1] = scene.colors[from + 1];
    colorsData[to + 2] = scene.colors[from + 2];
    colorsData[to + 3] = 0;
  }
  ringData.set(scene.rings);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gpu.cells);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CELL_COLUMNS, CELL_ROWS, gl.RGBA, gl.FLOAT, cellsData);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gpu.colors);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CELL_COLUMNS, CELL_ROWS, gl.RGBA, gl.FLOAT, colorsData);
  gl.uniform2f(gpu.uSize, width, height);
  gl.uniform1f(gpu.uBottom, target.height - height);
  gl.uniform1f(gpu.uAspect, scene.aspect);
  gl.uniform1f(gpu.uStretchX, scene.stretchX);
  gl.uniform1f(gpu.uStretchY, scene.stretchY);
  gl.uniform1i(gpu.uIdle, scene.idle ? 1 : 0);
  gl.uniform3fv(gpu.uRings, ringData);
  gl.uniform1i(gpu.uRingCount, scene.ringCount);
  gl.uniform3f(gpu.uBaseInk, inks.base[0], inks.base[1], inks.base[2]);
  gl.uniform3f(gpu.uRingInk, inks.ring[0], inks.ring[1], inks.ring[2]);
  gl.viewport(0, target.height - height, width, height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const composite = context.globalCompositeOperation;
  context.globalCompositeOperation = "copy";
  context.drawImage(target, 0, 0, width, height, 0, 0, width, height);
  context.globalCompositeOperation = composite;
  return true;
}
