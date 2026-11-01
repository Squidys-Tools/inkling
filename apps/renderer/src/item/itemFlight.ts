import { animate, usePresence } from "motion/react";
import { type RefObject, useEffect, useRef } from "react";

/** The grid's card for an item, while it is mounted. */
export const findCard = (id: string) =>
  document.querySelector<HTMLElement>(`[data-bench="card"][data-item-id="${CSS.escape(id)}"]`);

// The pre-rewrite flight timing: 600 ms × 0.85 at circ.inOut.
export const ITEM_FLIGHT_MS = 510;
export const ITEM_FLIGHT_EASE: [number, number, number, number] = [0.785, 0.135, 0.15, 0.86];
export const FRAME_RADIUS = "16px 0px 0px 16px";

const reducedMotionNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface CardBox {
  rect: DOMRect;
  radius: string;
}

// Captured by openItem before navigating; the item page consumes it on mount.
const flightBox: { current: CardBox | null } = { current: null };

// Four values, matching FRAME_RADIUS's shape, so motion can interpolate them.
const corners = (style: CSSStyleDeclaration) =>
  `${style.borderTopLeftRadius} ${style.borderTopRightRadius} ${style.borderBottomRightRadius} ${style.borderBottomLeftRadius}`;

export function captureFlightBox(id: string) {
  const card = findCard(id);
  flightBox.current = card
    ? { rect: card.getBoundingClientRect(), radius: corners(getComputedStyle(card)) }
    : null;
}

const offsets = (rect: DOMRect, parent: DOMRect) => ({
  left: `${rect.left - parent.left}px`,
  top: `${rect.top - parent.top}px`,
  right: `${parent.right - rect.right}px`,
  bottom: `${parent.bottom - rect.bottom}px`,
});

// Snaps a just-mounted covering page onto the captured card so the motion
// enter tweens insets, corners and --item-progress into the settled frame.
export function aimAtCard(el: HTMLElement) {
  const box = flightBox.current;
  flightBox.current = null;
  const parent = el.offsetParent?.getBoundingClientRect();
  if (!box || !parent || reducedMotionNow()) return;
  const { left, top, right, bottom } = offsets(box.rect, parent);
  el.style.left = left;
  el.style.top = top;
  el.style.right = right;
  el.style.bottom = bottom;
  el.style.borderRadius = box.radius;
  el.style.setProperty("--item-progress", "0");
}

/**
 * Lives inside the covering page. When it exits, it flies the page back into
 * its card — or fades it in place when the card is gone — then releases the
 * presence hold with safeToRemove.
 */
export function ItemFlightBack({
  id,
  pageRef,
}: {
  id: string;
  pageRef: RefObject<HTMLElement | null>;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const flown = useRef(false);
  useEffect(() => {
    if (isPresent || flown.current) return;
    flown.current = true;
    const page = pageRef.current;
    const card = page && !reducedMotionNow() ? findCard(id) : null;
    const parent = page?.offsetParent?.getBoundingClientRect();
    const playback =
      page && card && parent
        ? flyBack(page, card, parent)
        : page
          ? animate(page, { opacity: [1, 0] }, { duration: 0.25, ease: "easeIn" })
          : null;
    if (!playback) return safeToRemove();
    playback.then(safeToRemove, safeToRemove);
    return () => playback.stop();
  }, [isPresent, id, pageRef, safeToRemove]);
  return null;
}

function flyBack(page: HTMLElement, card: HTMLElement, parent: DOMRect) {
  const rect = card.getBoundingClientRect();
  animate(page, { opacity: [1, 0] }, { duration: 0.18, delay: 0.33, ease: "easeIn" });
  return animate(
    page,
    {
      ...offsets(rect, parent),
      borderRadius: [FRAME_RADIUS, corners(getComputedStyle(card))],
      "--item-progress": [1, 0],
    },
    { duration: ITEM_FLIGHT_MS / 1000, ease: ITEM_FLIGHT_EASE },
  );
}
