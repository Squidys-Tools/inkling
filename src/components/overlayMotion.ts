import { mediaAspectRatioFor } from "./ItemMedia";
import type { LibraryItem } from "../App";

export type FlightRect = { left: number; top: number; width: number; height: number };
export type SourceRects = { card: FlightRect; media: FlightRect };
export type Placement = "center" | "side";
export type OverlayDestination = { frame: FlightRect; mediaHeight: number; placement: Placement };

export const OVERLAY_FLIGHT_MS = 600;
// GSAP's circ.inOut is the classic easeInOutCirc curve.
export const OVERLAY_EASE = "circ.inOut";
const OVERLAY_MAX_WIDTH = 1080;
const OVERLAY_MIN_HEIGHT = 320;
const OVERLAY_MARGIN = 24;
const SIDE_MAX_WIDTH_RATIO = 0.62;
const EDGE_ZONE_RATIO = 0.3;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Height of the overlay's media area. The settled overlay renders this as an
// inline height so the flight frames land on exactly the same media box.
export function overlayMediaHeight(item: LibraryItem, frameWidth: number, viewportHeight: number): number {
  if (item.kind === "Image" && item.image) {
    return Math.min(frameWidth / mediaAspectRatioFor(item), viewportHeight * 0.42, 360);
  }
  if (item.social?.provider === "x") return Math.min(viewportHeight * 0.34, 320);
  return Math.min(viewportHeight * 0.34, 260);
}

// Chooses the overlay's final rectangle before the opening animation starts
// and keeps it stable for the whole open state. The frame preserves the source
// card's outer aspect ratio and is clamped to the available content area.
export function computeOverlayDestination(
  sourceRects: SourceRects,
  contentArea: FlightRect,
  item: LibraryItem,
  viewportHeight: number,
): OverlayDestination {
  const availWidth = Math.max(contentArea.width - OVERLAY_MARGIN * 2, 240);
  const availHeight = Math.max(contentArea.height - OVERLAY_MARGIN * 2, 240);
  const ratio = sourceRects.card.width / Math.max(sourceRects.card.height, 1);

  let width = Math.min(availWidth, OVERLAY_MAX_WIDTH, availHeight * ratio);
  let height = width / ratio;
  if (height > availHeight) {
    height = availHeight;
    width = Math.min(height * ratio, availWidth, OVERLAY_MAX_WIDTH);
  }
  if (height < OVERLAY_MIN_HEIGHT && availHeight > OVERLAY_MIN_HEIGHT) {
    height = Math.min(OVERLAY_MIN_HEIGHT, availHeight);
    width = Math.min(height * ratio, availWidth);
  }

  let placement: Placement = "center";
  let left = contentArea.left + (contentArea.width - width) / 2;
  const top = contentArea.top + (contentArea.height - height) / 2;

  // Prefer a side placement when the source card hugs an edge and the far
  // side of the content area can hold the overlay without covering it.
  const cardCenterX = sourceRects.card.left + sourceRects.card.width / 2;
  const relativeX = (cardCenterX - contentArea.left) / Math.max(contentArea.width, 1);
  const sideWidth = Math.min(width, availWidth * SIDE_MAX_WIDTH_RATIO);
  const sideHeight = sideWidth / ratio;
  if (relativeX < EDGE_ZONE_RATIO) {
    const freeToRight = contentArea.left + contentArea.width - (sourceRects.card.left + sourceRects.card.width);
    if (freeToRight >= sideWidth + OVERLAY_MARGIN) {
      placement = "side";
      width = sideWidth;
      height = sideHeight;
      left = contentArea.left + contentArea.width - width;
    }
  } else if (relativeX > 1 - EDGE_ZONE_RATIO) {
    const freeToLeft = sourceRects.card.left - contentArea.left;
    if (freeToLeft >= sideWidth + OVERLAY_MARGIN) {
      placement = "side";
      width = sideWidth;
      height = sideHeight;
      left = contentArea.left;
    }
  }

  return {
    frame: { left, top, width, height },
    mediaHeight: overlayMediaHeight(item, width, viewportHeight),
    placement,
  };
}

// Re-fits a settled destination to a resized viewport while keeping its
// placement decision and side anchoring intact.
export function refitDestination(
  current: OverlayDestination,
  ratio: number,
  contentArea: FlightRect,
  item: LibraryItem,
  viewportHeight: number,
): OverlayDestination {
  const availWidth = Math.max(contentArea.width - OVERLAY_MARGIN * 2, 240);
  const availHeight = Math.max(contentArea.height - OVERLAY_MARGIN * 2, 240);

  let width = Math.min(availWidth, OVERLAY_MAX_WIDTH, availHeight * ratio);
  let height = width / ratio;
  if (height > availHeight) {
    height = availHeight;
    width = Math.min(height * ratio, availWidth, OVERLAY_MAX_WIDTH);
  }
  if (height < OVERLAY_MIN_HEIGHT && availHeight > OVERLAY_MIN_HEIGHT) {
    height = Math.min(OVERLAY_MIN_HEIGHT, availHeight);
    width = Math.min(height * ratio, availWidth);
  }
  if (current.placement === "side") {
    width = Math.min(width, availWidth * SIDE_MAX_WIDTH_RATIO);
    height = width / ratio;
  }

  const anchoredRight = current.frame.left + current.frame.width / 2 > contentArea.left + contentArea.width / 2;
  const left =
    current.placement === "side"
      ? anchoredRight
        ? contentArea.left + contentArea.width - width
        : contentArea.left
      : contentArea.left + (contentArea.width - width) / 2;
  const top = contentArea.top + (contentArea.height - height) / 2;

  return {
    frame: { left, top, width, height },
    mediaHeight: overlayMediaHeight(item, width, viewportHeight),
    placement: current.placement,
  };
}

export function rectFrom(rect: DOMRect): FlightRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function relativeBox(box: FlightRect, frame: FlightRect): FlightRect {
  return { left: box.left - frame.left, top: box.top - frame.top, width: box.width, height: box.height };
}

// Measures the live grid card for an item, if it is still mounted. Returns
// viewport coordinates so flights can run inside the fixed overlay layer.
export function queryCardRects(id: string | number): SourceRects | null {
  const card = document.querySelector<HTMLElement>(
    `.library-card[data-library-item-id="${CSS.escape(String(id))}"]`,
  );
  if (!card) return null;
  const cardRect = card.getBoundingClientRect();
  const mediaRect = card.querySelector<HTMLElement>(".library-card-media")?.getBoundingClientRect();
  return {
    card: rectFrom(cardRect),
    media: mediaRect ? rectFrom(mediaRect) : { ...rectFrom(cardRect), height: 0 },
  };
}
