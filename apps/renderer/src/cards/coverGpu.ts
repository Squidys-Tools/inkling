import type { CoverScene, Mosaic, Rgb } from "./cardFx.ts";
import { paintWithGl } from "./glPaint.ts";

const CELL_COLUMNS = 9;
const CELL_ROWS = 12;
const RING_BLOBS = 9;
const CELL_FLOATS = CELL_COLUMNS * CELL_ROWS * 4;

// Line-by-line port of shadeCover in cardFx.ts: same pixel centres, same 3x3
// neighbour order, same smooth() and alpha/blend maths.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uSize;
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
  int cardRow = int(gl_FragCoord.y);
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
  outColor = vec4(outRgb / 255.0, alpha);
}`;

type Textures = { cells: WebGLTexture; colors: WebGLTexture };

// Textures belong to a context; a lost one is never used again, so one entry per context.
const textures = new WeakMap<WebGL2RenderingContext, Textures | null>();

const cellsData = new Float32Array(CELL_FLOATS);
const colorsData = new Float32Array(CELL_FLOATS);
const ringData = new Float32Array(RING_BLOBS * 3);

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

function texturesFor(gl: WebGL2RenderingContext) {
  let entry = textures.get(gl);
  if (entry === undefined) {
    const cells = cellTexture(gl);
    const colors = cellTexture(gl);
    entry = cells && colors && gl.getError() === gl.NO_ERROR ? { cells, colors } : null;
    textures.set(gl, entry);
  }
  return entry;
}

/**
 * Draws one cover frame on the shared WebGL context into `context`'s canvas. Returns false
 * when WebGL cannot draw it or the canvas size does not match the mosaic, leaving the
 * caller to run the CPU path.
 */
export function drawCoverGpu(
  context: CanvasRenderingContext2D,
  mosaic: Mosaic,
  scene: CoverScene,
  inks: { base: Rgb; ring: Rgb },
): boolean {
  const { width, height } = mosaic;
  if (context.canvas.width !== width || context.canvas.height !== height) return false;
  return paintWithGl(context, FRAGMENT_SHADER, width, height, (gl, uniform) => {
    const own = texturesFor(gl);
    if (!own) return false;
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
    gl.bindTexture(gl.TEXTURE_2D, own.cells);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CELL_COLUMNS, CELL_ROWS, gl.RGBA, gl.FLOAT, cellsData);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, own.colors);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      CELL_COLUMNS,
      CELL_ROWS,
      gl.RGBA,
      gl.FLOAT,
      colorsData,
    );
    gl.uniform1i(uniform("uCells"), 0);
    gl.uniform1i(uniform("uColors"), 1);
    gl.uniform2f(uniform("uSize"), width, height);
    gl.uniform1f(uniform("uAspect"), scene.aspect);
    gl.uniform1f(uniform("uStretchX"), scene.stretchX);
    gl.uniform1f(uniform("uStretchY"), scene.stretchY);
    gl.uniform1i(uniform("uIdle"), scene.idle ? 1 : 0);
    gl.uniform3fv(uniform("uRings[0]"), ringData);
    gl.uniform1i(uniform("uRingCount"), scene.ringCount);
    gl.uniform3f(uniform("uBaseInk"), inks.base[0], inks.base[1], inks.base[2]);
    gl.uniform3f(uniform("uRingInk"), inks.ring[0], inks.ring[1], inks.ring[2]);
  });
}
