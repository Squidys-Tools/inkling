// An element's box, in the canvas's CSS pixels, with its border radii in CSS
// order: top-left, top-right, bottom-right, bottom-left.
export type ShapeBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  radii: [number, number, number, number];
};

export type GlassShape = { x: number; y: number; width: number; height: number; radius: number };

// liquid-dom glass has one corner radius. A side whose corners are square (the
// edge tab's flat side against the frame) is pushed out past the canvas by that
// radius, so its rounded corners fall outside and get clipped.
export function glassShape(
  box: ShapeBox,
  canvasWidth: number,
  canvasHeight: number,
): GlassShape | null {
  const [topLeft, topRight, bottomRight, bottomLeft] = box.radii;
  const corner = Math.min(Math.max(...box.radii), box.width, box.height);
  let { x, y, width, height } = box;
  if (corner > 0) {
    if (topLeft === 0 && bottomLeft === 0) {
      x -= corner;
      width += corner;
    }
    if (topRight === 0 && bottomRight === 0) width += corner;
    if (topLeft === 0 && topRight === 0) {
      y -= corner;
      height += corner;
    }
    if (bottomLeft === 0 && bottomRight === 0) height += corner;
  }
  const radius = Math.min(corner, width / 2, height / 2);
  if (x >= canvasWidth || y >= canvasHeight || x + width <= 0 || y + height <= 0) return null;
  return { x, y, width, height, radius };
}

// The drop shadow (8px down, 24px blur) and refraction reach this far past a
// shape, in CSS pixels.
const BAND_MARGIN = 64;
// Device pixels. The band's texture is only reallocated when its height crosses
// a step, so a chip sliding in does not reallocate it every frame.
const BAND_STEP = 128;

/**
 * The device-pixel rows of a canvas that hold glass. liquid-dom runs a dozen
 * full-size passes per frame, so only these rows go through it; the rest of the
 * canvas is a plain copy of the content.
 */
export function glassBand(
  shapes: Iterable<{ y: number; height: number }>,
  dpr: number,
  canvasHeight: number,
) {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const shape of shapes) {
    minY = Math.min(minY, shape.y);
    maxY = Math.max(maxY, shape.y + shape.height);
  }
  if (minY > maxY) return { top: 0, height: 0 };
  const top = Math.max(0, Math.floor((minY - BAND_MARGIN) * dpr));
  const rows = Math.ceil((maxY + BAND_MARGIN) * dpr) - top;
  const height = Math.min(canvasHeight - top, Math.ceil(rows / BAND_STEP) * BAND_STEP);
  return { top, height: Math.max(0, height) };
}
