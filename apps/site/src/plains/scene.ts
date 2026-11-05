import { mix, mixQuad, type Quad } from "./homography.ts";

// Measured on the generated photo, in its pixels, from the chroma-green screen it was
// rendered with (media/laptop.webp has that screen keyed out). Change them with the photo.
export const photo = { width: 1376, height: 768 };
export const laptop = { x: 554, y: 245, width: 570, height: 422 };
const screen: Quad = [
  [764, 261],
  [1108, 284],
  [1069, 535],
  [725, 479],
];
// The app is laid out once at this size, the screen's 2560 × 1664 proportions.
export const app = { width: 1280, height: 832 };

// Grown a little past the keyed edge so the bezel, which sits above the app, covers the seam.
const bleed = 2.5;
const centre = screen.reduce<[number, number]>(
  (sum, [x, y]) => [sum[0] + x / 4, sum[1] + y / 4],
  [0, 0],
);
const screenQuad = screen.map(([x, y]) => {
  const dx = x - centre[0];
  const dy = y - centre[1];
  const length = Math.hypot(dx, dy);
  return [x + (dx / length) * bleed, y + (dy / length) * bleed] as const;
}) as unknown as Quad;

export const screenPolygon = screenQuad.map(([x, y]) => `${x},${y}`).join(" ");

const screenWidth =
  (Math.hypot(screen[1][0] - screen[0][0], screen[1][1] - screen[0][1]) +
    Math.hypot(screen[2][0] - screen[3][0], screen[2][1] - screen[3][1])) /
  2;

/** The flat app at the end of the dive: centred, with room for a line of copy beside it. */
function endFrame(viewWidth: number, viewHeight: number) {
  const width = Math.min(viewWidth * 0.7, ((viewHeight - 144) * app.width) / app.height);
  const height = (width * app.height) / app.width;
  const x = (viewWidth - width) / 2;
  const y = (viewHeight - height) / 2;
  return { x, y, width, height };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
/** How far `progress` has come through the span [from, to], from 0 to 1. */
export const span = (progress: number, from: number, to: number) =>
  clamp((progress - from) / (to - from));
const smooth = (value: number) => value * value * (3 - 2 * value);

/**
 * The camera at `progress`: one transform for both photo layers,
 * and the quad the app is drawn into, in viewport pixels.
 */
export function camera(viewWidth: number, viewHeight: number, progress: number) {
  const fit = Math.max(viewWidth / photo.width, viewHeight / photo.height);
  const offsetX = (viewWidth - photo.width * fit) / 2;
  const offsetY = (viewHeight - photo.height * fit) / 2;
  const end = endFrame(viewWidth, viewHeight);
  const push = smooth(span(progress, 0.04, 0.6));
  const flatten = smooth(span(progress, 0.2, 0.6));
  const zoom = (end.width / (screenWidth * fit)) ** push;
  const from = [offsetX + centre[0] * fit, offsetY + centre[1] * fit];
  const to = [end.x + end.width / 2, end.y + end.height / 2];
  const shiftX = mix(from[0]!, to[0]!, push) - zoom * from[0]!;
  const shiftY = mix(from[1]!, to[1]!, push) - zoom * from[1]!;
  const onScreen = screenQuad.map(
    ([x, y]) => [zoom * (offsetX + x * fit) + shiftX, zoom * (offsetY + y * fit) + shiftY] as const,
  ) as unknown as Quad;
  const flat: Quad = [
    [end.x, end.y],
    [end.x + end.width, end.y],
    [end.x + end.width, end.y + end.height],
    [end.x, end.y + end.height],
  ];
  return {
    // The stage already covers the viewport through CSS, so this is relative to that place.
    stage: `translate3d(${(zoom - 1) * offsetX + shiftX}px,${(zoom - 1) * offsetY + shiftY}px,0) scale(${zoom})`,
    quad: mixQuad(onScreen, flat, flatten),
  };
}
