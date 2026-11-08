import { loadingColor } from "@inkling/ui/tokens.stylex";

const mosaicColumns = 9;
const mosaicRows = 12;
export const revealSeconds = 4.4;

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const smooth = (low: number, high: number, value: number) => {
  const amount = clamp((value - low) / (high - low));
  return amount * amount * (3 - 2 * amount);
};
const hash = (left: number, right: number) => {
  const wave = Math.sin(left * 127.1 + right * 311.7) * 43758.5453;
  return wave - Math.floor(wave);
};

type Rgb = readonly [number, number, number];

const rgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const baseInk = rgb(loadingColor.mosaicBase);
const ringInk = rgb(loadingColor.ringInk);

export const stringSeed = (text: string) => {
  let total = 0;
  for (const character of text) total = (total * 31 + character.charCodeAt(0)) % 9973;
  return total;
};

/** The thumbnail shrunk to one colour per mosaic cell, or null when the image can't be read. */
export async function sampleCells(url: string): Promise<readonly Rgb[] | null> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = mosaicColumns;
    canvas.height = mosaicRows;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, mosaicColumns, mosaicRows);
    // A cross-origin image taints the canvas and this read throws.
    const { data } = context.getImageData(0, 0, mosaicColumns, mosaicRows);
    return Array.from({ length: mosaicColumns * mosaicRows }, (_, cell): Rgb => [
      data[cell * 4] ?? 0,
      data[cell * 4 + 1] ?? 0,
      data[cell * 4 + 2] ?? 0,
    ]);
  } catch {
    return null;
  }
}

const ringBlobs = 9;

/** Nine separate blobs drifting round a breathing circle, so neighbours pinch and part. */
function ringBalls(seconds: number, grow: number, aspect: number) {
  // On a narrow card the ring shrinks to fit the width instead of being clipped.
  const fit = Math.min(1, aspect / 0.7);
  const breathe = (1 + 0.07 * Math.sin(seconds * 0.9)) * fit;
  return Array.from({ length: ringBlobs }, (_, index) => {
    const pace = hash(index + 1, 7);
    const offset = hash(index + 1, 13);
    const angle =
      (index * Math.PI * 2) / ringBlobs +
      seconds * 0.22 +
      0.55 * Math.sin(seconds * (0.5 + pace * 0.5) + offset * 6.28);
    const radius = 0.19 * breathe * (1 + 0.1 * Math.sin(seconds * (0.8 + pace * 0.6) + offset * 9));
    return {
      x: aspect / 2 + radius * Math.cos(angle) * grow,
      y: 0.46 + radius * Math.sin(angle) * grow,
      r:
        (0.036 + 0.012 * pace + 0.008 * Math.sin(seconds * 1.5 + offset * 6.28)) *
        fit *
        Math.max(0.001, grow),
    };
  });
}

/**
 * The same ring on a canvas the size of an icon. Its blobs sit further out and stay small
 * for their spread, or at this size they merge into a solid disc. `ink` is a CSS `rgb()` colour.
 */
export function drawSmallRing(
  context: CanvasRenderingContext2D,
  image: ImageData,
  seconds: number,
  ink: string,
) {
  const [red = 0, green = 0, blue = 0] = ink.match(/[\d.]+/g)?.map(Number) ?? [];
  const blobs = ringBalls(seconds, 1, 1).map((blob) => ({
    x: 0.5 + (blob.x - 0.5) * 1.75,
    y: 0.5 + (blob.y - 0.46) * 1.75,
    r: blob.r * 1.4,
  }));
  const { width, height, data } = image;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let field = 0;
      for (let index = 0; index < blobs.length; index++) {
        const blob = blobs[index];
        const dx = (column + 0.5) / width - blob.x;
        const dy = (row + 0.5) / height - blob.y;
        field += (blob.r * blob.r) / (dx * dx + dy * dy + 1e-4);
      }
      const offset = (row * width + column) * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = smooth(0.75, 1.15, field) * 255;
    }
  }
  context.putImageData(image, 0, 0);
}

export type Mosaic = {
  width: number;
  height: number;
  cells: readonly Rgb[] | null;
  phases: readonly number[];
  image: ImageData;
  /** Whether the dark base is drawn, or left clear for a ring layer beneath to show through. */
  base: boolean;
  /** Scratch buffers for coverScene, allocated on the first draw and reused after. */
  scene?: CoverScene;
};

export const mosaicPhases = (seed: number) =>
  Array.from({ length: mosaicColumns * mosaicRows }, (_, cell) => hash(seed + 3, cell));

/**
 * Everything about a cover frame that does not depend on the pixel, in flat arrays a
 * renderer can upload: per cell centre x/y, size (0 skips the cell) and base alpha in
 * `cells` (4 floats each), colour in `colors` (3 each), ring blobs in `rings` (3 each).
 */
export type CoverScene = {
  cells: Float64Array;
  colors: Float64Array;
  rings: Float64Array;
  ringCount: number;
  aspect: number;
  stretchX: number;
  stretchY: number;
  idle: boolean;
};

const newCoverScene = (): CoverScene => ({
  cells: new Float64Array(mosaicColumns * mosaicRows * 4),
  colors: new Float64Array(mosaicColumns * mosaicRows * 3),
  rings: new Float64Array(ringBlobs * 3),
  ringCount: 0,
  aspect: 1,
  stretchX: 1,
  stretchY: 1,
  idle: true,
});

/** Fills the mosaic's reusable scene buffers with this frame's pixel-independent values. */
export function coverScene(
  mosaic: Mosaic,
  seconds: number,
  progress: number,
  ringGrow: number,
): CoverScene {
  const scene = (mosaic.scene ??= newCoverScene());
  const { width, height, cells, phases } = mosaic;
  const cellData = scene.cells;
  const colorData = scene.colors;
  const eased = ((progress - 0.1) / 0.9) * 1.06;
  // Before the reveal begins no cell has grown, so the ring needs none of the mosaic maths.
  scene.idle = eased <= 0;
  scene.aspect = width / height;
  // Cells are not square on a card that is not 3:4; stretching distances keeps the blobs round.
  scene.stretchX = Math.sqrt(width / mosaicColumns / (height / mosaicRows));
  scene.stretchY = 1 / scene.stretchX;
  for (let cell = 0; cell < mosaicColumns * mosaicRows; cell++) {
    const column = cell % mosaicColumns;
    const row = Math.floor(cell / mosaicColumns);
    const phase = phases[cell] ?? 0;
    const order = clamp((column / mosaicColumns + row / mosaicRows) * 0.35 + phase * 0.3);
    const growAt = order * 0.25;
    const shrinkAt = 0.4 + order * 0.45;
    const live =
      smooth(growAt, growAt + 0.18, eased) * (1 - smooth(shrinkAt, shrinkAt + 0.2, eased));
    const offset = cell * 4;
    cellData[offset] = column + 0.5 + 0.2 * Math.sin(seconds * 1.1 + phase * 6.28);
    cellData[offset + 1] = row + 0.5 + 0.2 * Math.cos(seconds * 0.9 + phase * 5);
    cellData[offset + 2] =
      live <= 0 ? 0 : 0.64 * live * (1 + 0.1 * Math.sin(seconds * 2 + phase * 9));
    cellData[offset + 3] = mosaic.base ? 1 - smooth(growAt + 0.04, growAt + 0.18, eased) : 0;
    const color = cells?.[cell] ?? baseInk;
    const tint = cell * 3;
    colorData[tint] = color[0];
    colorData[tint + 1] = color[1];
    colorData[tint + 2] = color[2];
  }
  const ring = ringGrow > 0.01 ? ringBalls(seconds, ringGrow, scene.aspect) : null;
  scene.ringCount = ring === null ? 0 : ringBlobs;
  if (ring !== null) {
    for (const [index, blob] of ring.entries()) {
      const offset = index * 3;
      scene.rings[offset] = blob.x;
      scene.rings[offset + 1] = blob.y;
      scene.rings[offset + 2] = blob.r;
    }
  }
  return scene;
}

/** The per-pixel pass over a cover scene: sums each pixel's 3x3 cell shares into mosaic.image. */
export function shadeCover(context: CanvasRenderingContext2D, mosaic: Mosaic, scene: CoverScene) {
  const { width, height, image } = mosaic;
  const data = image.data;
  const { cells, colors, rings, ringCount, aspect, stretchX, stretchY, idle } = scene;
  for (let row = 0; row < height; row++) {
    const y = (row + 0.5) / height;
    const cellY = y * mosaicRows;
    const baseRow = Math.floor(cellY);
    for (let column = 0; column < width; column++) {
      const x = (column + 0.5) / width;
      const offset = (row * width + column) * 4;
      const cellX = x * mosaicColumns;
      const baseColumn = Math.floor(cellX);
      let weight = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      if (!idle) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighborRow = baseRow + dy;
          if (neighborRow < 0 || neighborRow >= mosaicRows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const neighborColumn = baseColumn + dx;
            if (neighborColumn < 0 || neighborColumn >= mosaicColumns) continue;
            const cell = neighborRow * mosaicColumns + neighborColumn;
            const at = cell * 4;
            const size = cells[at + 2];
            if (size === 0) continue;
            const offsetX = (cellX - cells[at]) * stretchX;
            const offsetY = (cellY - cells[at + 1]) * stretchY;
            const share = (size * size) / (offsetX * offsetX + offsetY * offsetY + 0.02);
            const tint = cell * 3;
            weight += share;
            red += colors[tint] * share;
            green += colors[tint + 1] * share;
            blue += colors[tint + 2] * share;
          }
        }
      }
      const mosaicAlpha = smooth(0.7, 1.05, weight);
      if (weight > 0) {
        red /= weight;
        green /= weight;
        blue /= weight;
      }
      const own = (baseRow * mosaicColumns + baseColumn) * 4;
      const baseAlpha = cells[own + 3];
      let alpha = mosaicAlpha + baseAlpha * (1 - mosaicAlpha);
      let outRed =
        alpha > 0 ? (red * mosaicAlpha + baseInk[0] * baseAlpha * (1 - mosaicAlpha)) / alpha : 0;
      let outGreen =
        alpha > 0 ? (green * mosaicAlpha + baseInk[1] * baseAlpha * (1 - mosaicAlpha)) / alpha : 0;
      let outBlue =
        alpha > 0 ? (blue * mosaicAlpha + baseInk[2] * baseAlpha * (1 - mosaicAlpha)) / alpha : 0;
      if (ringCount > 0) {
        const reach = x * aspect;
        let field = 0;
        for (let index = 0; index < ringCount; index++) {
          const blob = index * 3;
          const dx = reach - rings[blob];
          const dy = y - rings[blob + 1];
          field += (rings[blob + 2] * rings[blob + 2]) / (dx * dx + dy * dy + 1e-4);
        }
        const inkAlpha = smooth(0.9, 1.1, field);
        const total = inkAlpha + alpha * (1 - inkAlpha);
        outRed = total > 0 ? (ringInk[0] * inkAlpha + outRed * alpha * (1 - inkAlpha)) / total : 0;
        outGreen =
          total > 0 ? (ringInk[1] * inkAlpha + outGreen * alpha * (1 - inkAlpha)) / total : 0;
        outBlue =
          total > 0 ? (ringInk[2] * inkAlpha + outBlue * alpha * (1 - inkAlpha)) / total : 0;
        alpha = total;
      }
      data[offset] = outRed;
      data[offset + 1] = outGreen;
      data[offset + 2] = outBlue;
      data[offset + 3] = alpha * 255;
    }
  }
  context.putImageData(image, 0, 0);
}

/**
 * One frame of the card's cover: the mosaic of thumbnail colours growing and
 * shrinking over a dark base (`progress` 0 is all base), with the ring of blobs on top.
 */
export function drawCover(
  context: CanvasRenderingContext2D,
  mosaic: Mosaic,
  seconds: number,
  progress: number,
  ringGrow: number,
) {
  shadeCover(context, mosaic, coverScene(mosaic, seconds, progress, ringGrow));
}

export const ringGrowAt = (elapsed: number) => smooth(0, 0.9, elapsed);

type Frame = (seconds: number) => boolean | void;
const live = new Set<Frame>();
let handle = 0;

/** A cap on how many cards move at once, so a batch of new items cannot repaint the whole grid. */
function budget(max: number) {
  let used = 0;
  return () => {
    if (used >= max) return null;
    used++;
    let held = true;
    return () => {
      if (held) used--;
      held = false;
    };
  };
}
const canvasSlot = budget(8);
/** The beam is a CSS animation, cheaper than a canvas, so more of them run. */
export const beamSlot = budget(16);

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function tick(now: number) {
  for (const frame of live) if (frame(now / 1000) === true) live.delete(frame);
  handle = live.size > 0 ? requestAnimationFrame(tick) : 0;
}

function startFrame(frame: Frame, release: (() => void) | null) {
  if (!release) {
    frame(performance.now() / 1000);
    return { animated: false, stop: () => {} };
  }
  live.add(frame);
  if (handle === 0) handle = requestAnimationFrame(tick);
  return {
    animated: true,
    stop: () => {
      live.delete(frame);
      release();
    },
  };
}

/**
 * Runs `frame` each animation frame until it returns true. Past the cap, or
 * under reduced motion, it draws once and reports `animated: false`, leaving a still cover.
 */
export function animate(frame: Frame) {
  return startFrame(frame, reducedMotion() ? null : canvasSlot());
}

/** Runs `frame` on the shared loop outside the canvas cap. It still draws once under reduced motion. */
export function animateUncapped(frame: Frame) {
  return startFrame(frame, reducedMotion() ? null : () => {});
}
