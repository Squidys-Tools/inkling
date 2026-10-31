// Zoom is screen pixels per image pixel. It runs continuously from the fitted
// size up to MAX_ZOOM (3200%).
export const MAX_ZOOM = 32;
// From this zoom on, an image pixel is large enough to read as a square, so the
// image renders pixelated and the grid appears.
export const PIXEL_ZOOM = 8;
// One button press scales by this much, so each step feels the same size at 20%
// as at 2000%.
export const BUTTON_ZOOM_FACTOR = 1.25;
// Ctrl+wheel: a typical 100px notch scales by about 1.22.
const WHEEL_ZOOM_RATE = 0.002;

export type Size = { width: number; height: number };
export type Offset = { x: number; y: number };

export function clampZoom(zoom: number, fit: number) {
  return Math.min(Math.max(fit, MAX_ZOOM), Math.max(fit, zoom));
}

export function wheelZoomFactor(deltaY: number) {
  return Math.exp(-deltaY * WHEEL_ZOOM_RATE);
}

// Pan moves the image only as far as it overhangs the frame, so the frame stays
// covered. An image smaller than the frame in one axis stays centred on it.
export function clampPan(pan: Offset, shown: Size, frame: Size): Offset {
  const maxX = Math.max(0, (shown.width - frame.width) / 2);
  const maxY = Math.max(0, (shown.height - frame.height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

// The pan that keeps the image point under `anchor` (frame-centre coordinates)
// in place while the zoom changes from `from` to `to`.
export function panAround(pan: Offset, anchor: Offset, from: number, to: number): Offset {
  const ratio = to / from;
  return {
    x: anchor.x - (anchor.x - pan.x) * ratio,
    y: anchor.y - (anchor.y - pan.y) * ratio,
  };
}
