import { mediaAspectRatioFor } from "./ItemMedia";
import type { LibraryItem } from "../App";

export type FlightRect = { left: number; top: number; width: number; height: number };
export type SourceRects = { card: FlightRect; media: FlightRect };

export const OVERLAY_FLIGHT_MS = 600;
// GSAP's circ.inOut is the classic easeInOutCirc curve.
export const OVERLAY_EASE = "circ.inOut";
const OVERLAY_WIDTH = 680;
const OVERLAY_MARGIN = 24;

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
  // band shows a natural framing instead of an aggressive crop.
  if (item.image) {
    return Math.min(width / mediaAspectRatioFor(item), viewportHeight * 0.55);
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
