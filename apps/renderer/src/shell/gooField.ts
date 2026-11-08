export const gooHeight = 34;

// Body blobs this close merge into one solid body, as the card ring's do.
const spacing = 6;
const bodyRadius = 12;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const smooth = (low: number, high: number, value: number) => {
  const amount = clamp((value - low) / (high - low));
  return amount * amount * (3 - 2 * amount);
};

/** Upper bound on how many blobs a row of this width can hold. */
export const maxBlobCount = (width: number) => Math.ceil(width / spacing) + 4;

/** The canvas's CSS ink colour as 0-255 RGB, parsed once per painter. */
export function inkRgb(ink: string): [number, number, number] {
  const [red = 0, green = 0, blue = 0] = ink.match(/[\d.]+/g)?.map(Number) ?? [];
  return [red, green, blue];
}

/** Blob centres and radii for one frame, pushed in the order the field sums them. */
export function eachBlob(
  seconds: number,
  front: number,
  width: number,
  push: (x: number, y: number, r: number) => void,
): void {
  // The body stops 10px short of the front; lobes and a droplet beyond it make the edge slosh.
  for (let x = spacing / 2; x < Math.min(width, front - 10); x += spacing) {
    push(x, gooHeight / 2 + 2.5 * Math.sin(seconds * 1.4 + x * 0.3), bodyRadius);
  }
  const grow = smooth(0, 6, front);
  if (grow > 0) {
    push(
      front - 4 + 3 * Math.sin(seconds * 1.9 + 0.5),
      gooHeight / 2 - 7 + 2 * Math.sin(seconds * 1.3),
      6 * grow,
    );
    push(
      front - 3 + 3 * Math.sin(seconds * 2.3 + 2.1),
      gooHeight / 2 + 7 + 2 * Math.sin(seconds * 1.7 + 1),
      6 * grow,
    );
    push(
      front + 1 + 4 * Math.sin(seconds * 2.6),
      gooHeight / 2 + 2 * Math.sin(seconds * 3.1),
      5 * grow,
    );
    push(
      front + 8 + 3 * Math.sin(seconds * 3.4),
      gooHeight / 2 - 3 + 2 * Math.sin(seconds * 2.2),
      3.2 * smooth(4, 14, front),
    );
  }
}
