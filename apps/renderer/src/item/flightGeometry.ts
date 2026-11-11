export type FlightRect = { left: number; top: number; width: number; height: number };
type Size = { width: number; height: number };
/** How the stage shows a card's image: at its own size, or covering the video art box. */
export type FlightMedia = "fit" | "poster";

export const flightDuration = { open: 620, close: 420 } as const;
const main = "cubic-bezier(0.3, 0, 0.1, 1)";
/** The curve of anything that leaves one rest pose for another. */
export const flightEase = main;

/** When a layer moves, as fractions of the flight's clock, and on which curve. Fades are linear. */
type Beat = readonly [start: number, end: number, easing?: string];
// The image leads. The panel arrives from off screen, so it only decelerates, and its text and
// the stage's own content come in last. Closing is shorter: the panel leaves first, the image last.
const open = {
  window: [0, 0.85, main],
  frame: [0, 0.12],
  scrim: [0, 0.4],
  ground: [0.2, 0.7],
  media: [0, 1, main],
  panel: [0.15, 1, "cubic-bezier(0.05, 0.7, 0.1, 1)"],
  details: [0.45, 0.9],
  shift: [0.45, 0.9, main],
  reveal: [0, 0.85, "step-end"],
  handoff: [0.85, 1],
} satisfies Record<string, Beat>;
export type FlightBeat = keyof typeof open;
export type FlightBeats = Record<FlightBeat, Beat>;
const close = {
  window: [0.1, 1, main],
  frame: [0.85, 1],
  scrim: [0.3, 1],
  ground: [0.1, 0.5],
  media: [0.1, 1, main],
  panel: [0, 0.55, "cubic-bezier(0.4, 0, 1, 1)"],
  details: [0, 0.25],
  shift: [0, 0.25],
  reveal: [0, 0.1, "step-end"],
  handoff: [0, 0.1],
} satisfies FlightBeats;
export const flightBeats: { open: FlightBeats; close: FlightBeats } = { open, close };

/** How far the library recedes behind the opening frame. */
export const scrimOpacity = 0.6;
export const detailsShift = 24;

export function beatTiming([start, end, easing = "linear"]: Beat, duration: number) {
  return {
    delay: start * duration,
    duration: (end - start) * duration,
    easing,
    fill: "both" as const,
  };
}

const itemPath = /^\/item\/[^/]+$/;
/** One item to another, as Similar and Back do: the view stays up, so nothing flies home. */
export const staysInView = (from: string, to: string) => itemPath.test(from) && itemPath.test(to);

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/** Fly to any card with a part on screen: the view's own edge crops the rest of the flight. */
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
  return width > 0 && height > 0;
}

/** How far to scroll so the whole card shows with `margin` to spare. A taller card stops at its top. */
export function scrollToShow(card: FlightRect, viewport: FlightRect, margin: number) {
  const above = card.top - viewport.top - margin;
  const below = card.top + card.height - (viewport.top + viewport.height - margin);
  return above < 0 ? above : Math.max(0, Math.min(above, below));
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
  // Field by field: `view` is a DOMRect, whose fields are prototype getters that a spread drops.
  return {
    left: view.left,
    top: view.top,
    width: below ? view.width : panel.left - view.left,
    height: below ? panel.top - view.top : view.height,
  };
}

/** The panel starts one panel away, past the edge it is docked to. */
export function panelOffset(panel: FlightRect, below: boolean) {
  return below ? `translateY(${px(panel.height)})` : `translateX(${px(panel.width)})`;
}

export const mediaRadius = { fit: 4, poster: 12 } as const;

// Mirrors ZoomableMedia's fit (never above its own size) and Stage's 720 by 520 art box.
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

/**
 * The image's flight in evenly spaced steps. Its box and corners move in screen pixels and each
 * step is posed afresh: easing two poses directly swells the corners as the scale changes.
 */
export function mediaFrames(
  size: Size,
  from: { box: FlightRect; radii: readonly number[] },
  to: { box: FlightRect; radii: readonly number[] },
  view: FlightRect,
  steps = 8,
) {
  return Array.from({ length: steps + 1 }, (_, step) => {
    const mix = (a: number, b: number) => a + ((b - a) * step) / steps;
    return mediaPose(
      size,
      {
        left: mix(from.box.left, to.box.left),
        top: mix(from.box.top, to.box.top),
        width: mix(from.box.width, to.box.width),
        height: mix(from.box.height, to.box.height),
      },
      view,
      from.radii.map((radius, corner) => mix(radius, to.radii[corner] ?? radius)),
    );
  });
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
