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
// Device pixels. The band's texture is only reallocated when a side crosses a
// step, so a chip sliding in does not reallocate it every frame.
const BAND_STEP = 128;

export type GlassBand = { left: number; top: number; width: number; height: number };

/**
 * Device-pixel rects that hold glass, one band per cluster. liquid-dom runs a
 * dozen passes over each band per frame, so bands cover only the shape extents
 * plus margin, not the whole canvas. Bands share one size so liquid-dom keeps
 * its render targets between them.
 */
export function glassBands(
  shapes: Iterable<{ x: number; y: number; width: number; height: number }>,
  dpr: number,
  canvasWidth: number,
  canvasHeight: number,
): GlassBand[] {
  const spans = [...shapes]
    .map((shape) => ({
      left: Math.max(0, Math.floor((shape.x - BAND_MARGIN) * dpr)),
      right: Math.min(canvasWidth, Math.ceil((shape.x + shape.width + BAND_MARGIN) * dpr)),
      top: Math.max(0, Math.floor((shape.y - BAND_MARGIN) * dpr)),
      bottom: Math.min(canvasHeight, Math.ceil((shape.y + shape.height + BAND_MARGIN) * dpr)),
    }))
    .sort((a, b) => a.top - b.top);
  const merged: typeof spans = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.top <= last.bottom) {
      last.top = Math.min(last.top, span.top);
      last.bottom = Math.max(last.bottom, span.bottom);
      last.left = Math.min(last.left, span.left);
      last.right = Math.max(last.right, span.right);
    } else {
      merged.push({ ...span });
    }
  }
  if (merged.length === 0 || canvasHeight <= 0 || canvasWidth <= 0) return [];
  const rows = Math.max(...merged.map((span) => span.bottom - span.top));
  const cols = Math.max(...merged.map((span) => span.right - span.left));
  const height = Math.min(canvasHeight, Math.ceil(rows / BAND_STEP) * BAND_STEP);
  const width = Math.min(canvasWidth, Math.ceil(cols / BAND_STEP) * BAND_STEP);
  if (width * height * merged.length >= canvasWidth * canvasHeight) {
    return [{ left: 0, top: 0, width: canvasWidth, height: canvasHeight }];
  }
  return merged.map((span) => ({
    left: Math.min(span.left, canvasWidth - width),
    top: Math.min(span.top, canvasHeight - height),
    width,
    height,
  }));
}
