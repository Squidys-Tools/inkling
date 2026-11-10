import { eachBlob, gooHeight, smooth } from "./gooField.ts";

type PooledBlob = { x: number; y: number; r2: number; dy2: number };

// Pixels more than ~31px behind the front are full ink and more than ~23px ahead are empty;
// only this band (with margin) needs the field, the rest is written 255 behind and 0 ahead.
const back = 48;
const ahead = 32;

// Shared scratch space: paintGooAlpha is synchronous and never re-entrant, so one pool serves every canvas.
const pool: PooledBlob[] = [];

function fillBlobs(seconds: number, front: number, width: number) {
  let count = 0;
  eachBlob(seconds, front, width, (x, y, r) => {
    if (count === pool.length) pool.push({ x: 0, y: 0, r2: 0, dy2: 0 });
    const blob = pool[count];
    blob.x = x;
    blob.y = y;
    blob.r2 = r * r;
    count += 1;
  });
  return count;
}

/** Writes only the alpha bytes (stride 4, offset 3) of an RGBA buffer `width` x gooHeight. */
export function paintGooAlpha(
  data: Uint8ClampedArray,
  width: number,
  seconds: number,
  front: number,
): void {
  const count = fillBlobs(seconds, front, width);
  const low = Math.min(width, Math.max(0, Math.floor(front - back)));
  const high = Math.min(width, Math.max(low, Math.ceil(front + ahead)));
  for (let row = 0; row < gooHeight; row++) {
    const y = row + 0.5;
    for (let index = 0; index < count; index++) {
      const blob = pool[index];
      const dy = y - blob.y;
      blob.dy2 = dy * dy;
    }
    const offset = row * width * 4 + 3;
    for (let column = 0; column < low; column++) data[offset + column * 4] = 255;
    for (let column = low; column < high; column++) {
      const x = column + 0.5;
      let field = 0;
      for (let index = 0; index < count; index++) {
        const blob = pool[index];
        const dx = x - blob.x;
        field += blob.r2 / (dx * dx + blob.dy2 + 1e-4);
      }
      data[offset + column * 4] = smooth(0.9, 1.3, field) * 255;
    }
    for (let column = high; column < width; column++) data[offset + column * 4] = 0;
  }
}
