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

export type Rgb = readonly [number, number, number];

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
  const breathe = 1 + 0.07 * Math.sin(seconds * 0.9);
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
        Math.max(0.001, grow),
    };
  });
}

export type Mosaic = {
  width: number;
  height: number;
  cells: readonly Rgb[] | null;
  phases: readonly number[];
  image: ImageData;
};

export const mosaicPhases = (seed: number) =>
  Array.from({ length: mosaicColumns * mosaicRows }, (_, cell) => hash(seed + 3, cell));

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
  const { width, height, cells, phases, image } = mosaic;
  const data = image.data;
  const aspect = width / height;
  const ring = ringGrow > 0.01 ? ringBalls(seconds, ringGrow, aspect) : null;
  const eased = ((progress - 0.1) / 0.9) * 1.06;
  // Before the reveal begins no cell has grown, so the ring needs none of the mosaic maths.
  const idle = eased <= 0;
  for (let row = 0; row < height; row++) {
    const y = (row + 0.5) / height;
    for (let column = 0; column < width; column++) {
      const x = (column + 0.5) / width;
      const offset = (row * width + column) * 4;
      const cellX = x * mosaicColumns;
      const cellY = y * mosaicRows;
      const baseColumn = Math.floor(cellX);
      const baseRow = Math.floor(cellY);
      let weight = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let dy = idle ? 2 : -1; dy <= 1; dy++) {
        const neighborRow = baseRow + dy;
        if (neighborRow < 0 || neighborRow >= mosaicRows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const neighborColumn = baseColumn + dx;
          if (neighborColumn < 0 || neighborColumn >= mosaicColumns) continue;
          const cell = neighborRow * mosaicColumns + neighborColumn;
          const phase = phases[cell] ?? 0;
          const order = clamp(
            (neighborColumn / mosaicColumns + neighborRow / mosaicRows) * 0.35 + phase * 0.3,
          );
          const growAt = order * 0.25;
          const shrinkAt = 0.4 + order * 0.45;
          const live =
            smooth(growAt, growAt + 0.18, eased) * (1 - smooth(shrinkAt, shrinkAt + 0.2, eased));
          if (live <= 0) continue;
          const centerX = neighborColumn + 0.5 + 0.2 * Math.sin(seconds * 1.1 + phase * 6.28);
          const centerY = neighborRow + 0.5 + 0.2 * Math.cos(seconds * 0.9 + phase * 5);
          const size = 0.64 * live * (1 + 0.1 * Math.sin(seconds * 2 + phase * 9));
          const share =
            (size * size) /
            ((cellX - centerX) * (cellX - centerX) + (cellY - centerY) * (cellY - centerY) + 0.02);
          const color = cells?.[cell] ?? baseInk;
          weight += share;
          red += color[0] * share;
          green += color[1] * share;
          blue += color[2] * share;
        }
      }
      const mosaicAlpha = smooth(0.7, 1.05, weight);
      if (weight > 0) {
        red /= weight;
        green /= weight;
        blue /= weight;
      }
      const ownCell = baseRow * mosaicColumns + baseColumn;
      const ownPhase = phases[ownCell] ?? 0;
      const ownOrder = clamp(
        (baseColumn / mosaicColumns + baseRow / mosaicRows) * 0.35 + ownPhase * 0.3,
      );
      const baseAlpha = 1 - smooth(ownOrder * 0.25 + 0.04, ownOrder * 0.25 + 0.18, eased);
      let alpha = mosaicAlpha + baseAlpha * (1 - mosaicAlpha);
      const mix = (mosaicValue: number, baseValue: number) =>
        alpha > 0
          ? (mosaicValue * mosaicAlpha + baseValue * baseAlpha * (1 - mosaicAlpha)) / alpha
          : 0;
      let outRed = mix(red, baseInk[0]);
      let outGreen = mix(green, baseInk[1]);
      let outBlue = mix(blue, baseInk[2]);
      if (ring) {
        let field = 0;
        for (const blob of ring) {
          const dx = x * aspect - blob.x;
          const dy = y - blob.y;
          field += (blob.r * blob.r) / (dx * dx + dy * dy + 1e-4);
        }
        const inkAlpha = smooth(0.9, 1.1, field);
        const total = inkAlpha + alpha * (1 - inkAlpha);
        const blend = (ink: number, under: number) =>
          total > 0 ? (ink * inkAlpha + under * alpha * (1 - inkAlpha)) / total : 0;
        outRed = blend(ringInk[0], outRed);
        outGreen = blend(ringInk[1], outGreen);
        outBlue = blend(ringInk[2], outBlue);
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

export const ringGrowAt = (elapsed: number) => smooth(0, 0.9, elapsed);
export const revealRingGrow = (progress: number) => 1 - smooth(0, 0.1, progress);

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

/**
 * Runs `frame` each animation frame until it returns true. Past the cap, or
 * under reduced motion, it draws once and reports `animated: false`, leaving a still cover.
 */
export function animate(frame: Frame) {
  const release = reducedMotion() ? null : canvasSlot();
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
