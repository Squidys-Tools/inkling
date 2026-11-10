export type FlightRect = { left: number; top: number; width: number; height: number };
type Size = { width: number; height: number };
/** How the stage shows a card's image: at its own size, or covering the video art box. */
export type FlightMedia = "fit" | "poster";

export const flightDuration = 510;
export const flightEase = "cubic-bezier(0.65, 0, 0.35, 1)";
/** Beats in eased progress: the frame fills in early, the dotted stage through the middle. */
export const flightBeats = { frame: [0, 0.25], stage: [0.15, 0.75] } as const;

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/** Only fly to a card when at least three quarters of each axis is visible. */
export function usableOrigin(card: FlightRect, viewport: FlightRect) {
  if (card.width <= 0 || card.height <= 0) return false;
  const width = Math.max(
    0,
    Math.min(card.left + card.width, viewport.left + viewport.width) -
      Math.max(card.left, viewport.left),
  );
  const height = Math.max(
    0,
    Math.min(card.top + card.height, viewport.top + viewport.height) -
      Math.max(card.top, viewport.top),
  );
  return width / card.width >= 0.75 && height / card.height >= 0.75;
}

// Mirrors the branch order in Stage.tsx: only these kinds put the card's own image on the stage.
export function flightMedia(view: {
  kind: string;
  image?: string;
  isXPost: boolean;
  isVideoLink: boolean;
}): FlightMedia | null {
  if (!view.image || view.isXPost || view.kind === "Quote" || view.kind === "PDF") return null;
  if (view.kind === "Video") return view.isVideoLink ? "poster" : null;
  return "fit";
}

/** A clip that shows `window` through an element laid out at `box`. */
export function clipInset(window: FlightRect, box: FlightRect, radius: number) {
  const top = window.top - box.top;
  const left = window.left - box.left;
  const right = box.left + box.width - window.left - window.width;
  const bottom = box.top + box.height - window.top - window.height;
  return `inset(${px(top)} ${px(right)} ${px(bottom)} ${px(left)} round ${px(radius)})`;
}

/** What the details panel leaves to the stage: the columns beside it, or the rows above it. */
export function stageRegion(view: FlightRect, panel: FlightRect, below: boolean): FlightRect {
  return below
    ? { ...view, height: panel.top - view.top }
    : { ...view, width: panel.left - view.left };
}

/** The panel starts one panel away, past the edge it is docked to. */
export function panelOffset(panel: FlightRect, below: boolean) {
  return below ? `translateY(${px(panel.height)})` : `translateX(${px(panel.width)})`;
}

/** Opacity that rises between two points of eased progress and holds outside them. */
export function fadeBetween([start, end]: readonly [number, number]): Keyframe[] {
  return [
    { opacity: 0, offset: 0 },
    { opacity: 0, offset: start },
    { opacity: 1, offset: end },
    { opacity: 1, offset: 1 },
  ];
}

export const mediaRadius = { fit: 4, poster: 12 } as const;

// Mirrors ZoomableImage's fit (never above its own size) and Stage's 720 by 520 art box.
export function settledMedia(mode: FlightMedia, natural: Size, stage: FlightRect): FlightRect {
  const fit = Math.min(1, stage.width / natural.width, stage.height / natural.height);
  const width = mode === "poster" ? Math.min(stage.width, 720) : natural.width * fit;
  const height = mode === "poster" ? Math.min(stage.height, 520) : natural.height * fit;
  return {
    left: stage.left + (stage.width - width) / 2,
    top: stage.top + (stage.height - height) / 2,
    width,
    height,
  };
}

export function contains(outer: FlightRect, inner: FlightRect) {
  return (
    inner.left >= outer.left - 1 &&
    inner.top >= outer.top - 1 &&
    inner.left + inner.width <= outer.left + outer.width + 1 &&
    inner.top + inner.height <= outer.top + outer.height + 1
  );
}

/** The size at which an image of this shape covers `box`. */
export function coverSize(natural: Size, box: FlightRect): Size {
  const scale = Math.max(box.width / natural.width, box.height / natural.height);
  return { width: natural.width * scale, height: natural.height * scale };
}

/**
 * One end of the image's FLIP: a clone laid out at `size` on the view's top-left corner is
 * scaled uniformly until it covers `box`, and cropped to it in its own unscaled pixels.
 */
export function mediaPose(size: Size, box: FlightRect, view: FlightRect, radii: readonly number[]) {
  const scale = Math.max(box.width / size.width, box.height / size.height);
  const x = box.left - view.left + (box.width - size.width * scale) / 2;
  const y = box.top - view.top + (box.height - size.height * scale) / 2;
  const cropX = (size.width - box.width / scale) / 2;
  const cropY = (size.height - box.height / scale) / 2;
  const round = radii.map((radius) => px(radius / scale)).join(" ");
  return {
    transform: `translate(${px(x)}, ${px(y)}) scale(${Math.round(scale * 10000) / 10000})`,
    clipPath: `inset(${px(cropY)} ${px(cropX)} round ${round})`,
  };
}

/** The card rounds only the image corners that sit in its own corners: top-left, clockwise. */
export function cornerRadii(image: FlightRect, card: FlightRect, radius: number) {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  const left = near(image.left, card.left);
  const top = near(image.top, card.top);
  const right = near(image.left + image.width, card.left + card.width);
  const bottom = near(image.top + image.height, card.top + card.height);
  return [top && left, top && right, bottom && right, bottom && left].map((rounded) =>
    rounded ? radius : 0,
  );
}

/** The same keyframes played from the open pose back to the card. */
export function reverseFrames(frames: readonly Keyframe[]) {
  return frames
    .toReversed()
    .map((frame) =>
      typeof frame.offset === "number" ? { ...frame, offset: 1 - frame.offset } : frame,
    );
}
