import { mediaAspectRatioFor } from "./ItemMedia";
import type { LibraryItem } from "../App";

export type FlightRect = { left: number; top: number; width: number; height: number };
export type SourceRects = { card: FlightRect; media: FlightRect };

export const OVERLAY_FLIGHT_MS = 600 * 0.85;
// GSAP's circ.inOut is the classic easeInOutCirc curve.
export const OVERLAY_EASE = "circ.inOut";
const OVERLAY_WIDTH = 680;
const OVERLAY_MARGIN = 24;
// Hard cap for the details preview's media band so thumbnails stay
// proportionate to the reading overlay and the cards behind it.
const OVERLAY_MEDIA_MAX_HEIGHT = 400;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The overlay opens over the general area of its parent card: width is a
// fixed comfortable reading size, height comes from the dialog's own content
// (measured by the component), and the frame is centered on the source card
// with clamping so nearby screen borders are respected.
export function overlayWidth(contentArea: FlightRect): number {
  return Math.min(OVERLAY_WIDTH, Math.max(contentArea.width - OVERLAY_MARGIN * 2, 240));
}

export function overlayMediaHeight(item: LibraryItem, width: number, viewportHeight: number): number {
  // Items with a thumbnail use the thumbnail's own aspect ratio so the media
  // band shows a natural framing instead of an aggressive crop, but the band
  // is capped so large/tall thumbnails never balloon past the reading frame.
  if (item.image) {
    return Math.min(width / mediaAspectRatioFor(item), viewportHeight * 0.48, OVERLAY_MEDIA_MAX_HEIGHT);
  }
  if (item.social?.provider === "x") return Math.min(viewportHeight * 0.34, 320);
  return Math.min(viewportHeight * 0.34, 260);
}

// Centers the frame on the parent card, clamped to the content area.
export function overlayPosition(
  cardRect: FlightRect,
  contentArea: FlightRect,
  width: number,
  height: number,
): { left: number; top: number } {
  const maxLeft = contentArea.left + Math.max(contentArea.width - OVERLAY_MARGIN - width, OVERLAY_MARGIN);
  const maxTop = contentArea.top + Math.max(contentArea.height - OVERLAY_MARGIN - height, OVERLAY_MARGIN);
  return {
    left: Math.min(
      Math.max(cardRect.left + cardRect.width / 2 - width / 2, contentArea.left + OVERLAY_MARGIN),
      maxLeft,
    ),
    top: Math.min(
      Math.max(cardRect.top + cardRect.height / 2 - height / 2, contentArea.top + OVERLAY_MARGIN),
      maxTop,
    ),
  };
}

export function rectFrom(rect: DOMRect): FlightRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

const CARD_OFFSCREEN_THRESHOLD = 0.25;

export function isCardTooFarOffscreen(card: FlightRect, viewport: FlightRect): boolean {
  if (card.width <= 0 || card.height <= 0) return true;
  const visibleWidth = Math.max(0, Math.min(card.left + card.width, viewport.left + viewport.width) - Math.max(card.left, viewport.left));
  const visibleHeight = Math.max(0, Math.min(card.top + card.height, viewport.top + viewport.height) - Math.max(card.top, viewport.top));
  const clippedWidth = 1 - visibleWidth / card.width;
  const clippedHeight = 1 - visibleHeight / card.height;
  return Math.max(clippedWidth, clippedHeight) > CARD_OFFSCREEN_THRESHOLD;
}

export function scrollViewport(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  return root.querySelector<HTMLElement>('[data-testid="virtuoso-scroller"]') ?? root;
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
