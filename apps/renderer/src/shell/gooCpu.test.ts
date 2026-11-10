import { test } from "bun:test";
import { paintGooAlpha } from "./gooCpu.ts";

// The shipped GooLiquid.tsx field, copied verbatim so the band painter is checked against it.
const height = 34;
const spacing = 6;
const bodyRadius = 12;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (low: number, high: number, value: number) => {
  const amount = clamp((value - low) / (high - low));
  return amount * amount * (3 - 2 * amount);
};

type Blob = { x: number; y: number; r: number };

/** The body stops 10px short of the front; lobes and a droplet beyond it make the edge slosh. */
function blobsFor(seconds: number, front: number, width: number): Blob[] {
  const blobs: Blob[] = [];
  for (let x = spacing / 2; x < Math.min(width, front - 10); x += spacing) {
    blobs.push({ x, y: height / 2 + 2.5 * Math.sin(seconds * 1.4 + x * 0.3), r: bodyRadius });
  }
  const grow = smooth(0, 6, front);
  if (grow > 0) {
    blobs.push({
      x: front - 4 + 3 * Math.sin(seconds * 1.9 + 0.5),
      y: height / 2 - 7 + 2 * Math.sin(seconds * 1.3),
      r: 6 * grow,
    });
    blobs.push({
      x: front - 3 + 3 * Math.sin(seconds * 2.3 + 2.1),
      y: height / 2 + 7 + 2 * Math.sin(seconds * 1.7 + 1),
      r: 6 * grow,
    });
    blobs.push({
      x: front + 1 + 4 * Math.sin(seconds * 2.6),
      y: height / 2 + 2 * Math.sin(seconds * 3.1),
      r: 5 * grow,
    });
    blobs.push({
      x: front + 8 + 3 * Math.sin(seconds * 3.4),
      y: height / 2 - 3 + 2 * Math.sin(seconds * 2.2),
      r: 3.2 * smooth(4, 14, front),
    });
  }
  return blobs;
}

// drawBar's pixel loop verbatim, minus the canvas: it fills one RGBA buffer per frame.
function referenceFrame(width: number, seconds: number, front: number) {
  const blobs = blobsFor(seconds, front, width);
  const [red = 0, green = 0, blue = 0] = "rgb(18, 52, 86)".match(/[\d.]+/g)?.map(Number) ?? [];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const y = row + 0.5;
    for (let column = 0; column < width; column++) {
      const x = column + 0.5;
      let field = 0;
      for (const blob of blobs) {
        const dx = x - blob.x;
        const dy = y - blob.y;
        field += (blob.r * blob.r) / (dx * dx + dy * dy + 1e-4);
      }
      const offset = (row * width + column) * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = smooth(0.9, 1.3, field) * 255;
    }
  }
  return data;
}

for (const width of [224, 52, 37]) {
  test(`paintGooAlpha matches the shipped field at width ${width}`, () => {
    const actual = new Uint8ClampedArray(width * height * 4);
    const steps = 240;
    for (let step = 0; step <= steps; step++) {
      const front = (step / steps) * width;
      const seconds = step * 0.731;
      const expected = referenceFrame(width, seconds, front);
      paintGooAlpha(actual, width, seconds, front);
      for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
          const offset = (row * width + column) * 4 + 3;
          const want = expected[offset];
          const got = actual[offset];
          if (got !== want) {
            throw new Error(
              `width ${width} front ${front.toFixed(3)} seconds ${seconds.toFixed(3)}: ` +
                `alpha ${got} at column ${column} row ${row}, expected ${want}`,
            );
          }
        }
      }
    }
  });
}
