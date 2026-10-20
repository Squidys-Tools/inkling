export type FlightRect = { left: number; top: number; width: number; height: number };
export type SourceRects = { card: FlightRect; media: FlightRect };

export const OVERLAY_FLIGHT_MS = 600 * 0.85;
// GSAP's circ.inOut is the classic easeInOutCirc curve.
export const OVERLAY_EASE = "circ.inOut";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function rectFrom(rect: DOMRect): FlightRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

const CARD_OFFSCREEN_THRESHOLD = 0.25;

export function isCardTooFarOffscreen(card: FlightRect, viewport: FlightRect): boolean {
  if (card.width <= 0 || card.height <= 0) return true;
  const visibleWidth = Math.max(
    0,
    Math.min(card.left + card.width, viewport.left + viewport.width) -
      Math.max(card.left, viewport.left),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(card.top + card.height, viewport.top + viewport.height) -
      Math.max(card.top, viewport.top),
  );
  const clippedWidth = 1 - visibleWidth / card.width;
  const clippedHeight = 1 - visibleHeight / card.height;
  return Math.max(clippedWidth, clippedHeight) > CARD_OFFSCREEN_THRESHOLD;
}

export function scrollViewport(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  return root.querySelector<HTMLElement>('[data-testid="virtuoso-scroller"]') ?? root;
}

// The floating toolbar covers the top of the grid, so a card only counts as
// visible below the toolbar's bottom edge.
export function scrollViewportRect(scroller: HTMLElement, toolbar: HTMLElement | null): FlightRect {
  const rect = rectFrom(scroller.getBoundingClientRect());
  const top = Math.max(rect.top, toolbar?.getBoundingClientRect().bottom ?? rect.top);
  return { ...rect, top, height: Math.max(0, rect.top + rect.height - top) };
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
