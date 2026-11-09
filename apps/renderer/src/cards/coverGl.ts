import { paintWithGl } from "./glPaint.ts";

// Both shaders map a fragment to the CPU painter's (column + 0.5) / width, (row + 0.5) / height;
// WebGL's y grows upward, so y is flipped. They write premultiplied colour.
const ringSource = `#version 300 es
precision highp float;
uniform vec3 uBlobs[9];
uniform vec2 uSize;
uniform vec3 uBase;
uniform vec3 uInk;
uniform float uBaseAlpha;
out vec4 outColor;
void main() {
  float x = gl_FragCoord.x / uSize.y;
  float y = (uSize.y - gl_FragCoord.y) / uSize.y;
  float field = 0.0;
  for (int i = 0; i < 9; i++) {
    vec3 blob = uBlobs[i];
    float dx = x - blob.x;
    float dy = y - blob.y;
    field += (blob.z * blob.z) / (dx * dx + dy * dy + 1e-4);
  }
  float ink = smoothstep(0.9, 1.1, field);
  float under = uBaseAlpha * (1.0 - ink);
  outColor = vec4(uInk * ink + uBase * under, ink + under);
}
`;

const mosaicSource = `#version 300 es
precision highp float;
uniform vec4 uCells[108];
uniform vec3 uColors[108];
uniform vec2 uSize;
uniform vec2 uStretch;
uniform vec3 uBase;
out vec4 outColor;
void main() {
  float cellX = gl_FragCoord.x / uSize.x * 9.0;
  float cellY = (uSize.y - gl_FragCoord.y) / uSize.y * 12.0;
  int baseColumn = int(floor(cellX));
  int baseRow = int(floor(cellY));
  float weight = 0.0;
  vec3 color = vec3(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    int row = baseRow + dy;
    if (row < 0 || row >= 12) continue;
    for (int dx = -1; dx <= 1; dx++) {
      int column = baseColumn + dx;
      if (column < 0 || column >= 9) continue;
      vec4 cell = uCells[row * 9 + column];
      if (cell.z <= 0.0) continue;
      float offsetX = (cellX - cell.x) * uStretch.x;
      float offsetY = (cellY - cell.y) * uStretch.y;
      float share = (cell.z * cell.z) / (offsetX * offsetX + offsetY * offsetY + 0.02);
      weight += share;
      color += uColors[row * 9 + column] * share;
    }
  }
  float mosaicAlpha = smoothstep(0.7, 1.05, weight);
  vec3 mosaic = weight > 0.0 ? color / weight : vec3(0.0);
  float under = uCells[baseRow * 9 + baseColumn].w * (1.0 - mosaicAlpha);
  outColor = vec4(mosaic * mosaicAlpha + uBase * under, mosaicAlpha + under);
}
`;

type Rgb = readonly [number, number, number];
type Blob = { x: number; y: number; r: number };

const ringData = new Float32Array(27);

/** The waiting cover: the ring of `blobs` (in the CPU painter's units) over the base, or over nothing. */
export function paintRingGl(
  target: CanvasRenderingContext2D,
  width: number,
  height: number,
  blobs: readonly Blob[] | null,
  base: Rgb,
  ink: Rgb,
  baseAlpha: number,
) {
  ringData.fill(0);
  blobs?.forEach((blob, index) => ringData.set([blob.x, blob.y, blob.r], index * 3));
  return paintWithGl(target, ringSource, width, height, (gl, uniform) => {
    gl.uniform3fv(uniform("uBlobs"), ringData);
    gl.uniform2f(uniform("uSize"), width, height);
    gl.uniform3f(uniform("uBase"), base[0] / 255, base[1] / 255, base[2] / 255);
    gl.uniform3f(uniform("uInk"), ink[0] / 255, ink[1] / 255, ink[2] / 255);
    gl.uniform1f(uniform("uBaseAlpha"), baseAlpha);
  });
}

const cellUpload = new Float32Array(108 * 4);

/**
 * The reveal: `cells` holds per mosaic cell its centre x, centre y, size (0 when not grown)
 * and the base's alpha, `colors` its colour in 0..1.
 */
export function paintMosaicGl(
  target: CanvasRenderingContext2D,
  width: number,
  height: number,
  cells: ArrayLike<number>,
  colors: Float32Array,
  stretchX: number,
  base: Rgb,
) {
  return paintWithGl(target, mosaicSource, width, height, (gl, uniform) => {
    cellUpload.set(cells);
    gl.uniform4fv(uniform("uCells"), cellUpload);
    gl.uniform3fv(uniform("uColors"), colors);
    gl.uniform2f(uniform("uSize"), width, height);
    gl.uniform2f(uniform("uStretch"), stretchX, 1 / stretchX);
    gl.uniform3f(uniform("uBase"), base[0] / 255, base[1] / 255, base[2] / 255);
  });
}
