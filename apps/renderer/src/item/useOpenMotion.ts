import { type RefObject, useEffectEvent, useLayoutEffect } from "react";

/** The grid's card for an item, while it is mounted. */
export const findCard = (id: string) =>
  document.querySelector<HTMLElement>(`[data-bench="card"][data-item-id="${CSS.escape(id)}"]`);

// The card's center in the view's coordinates, or null when it is not on screen.
function cardCenter(view: HTMLElement, id: string) {
  const card = findCard(id)?.getBoundingClientRect();
  const box = view.getBoundingClientRect();
  if (!card || card.width === 0) return null;
  const x = card.left + card.width / 2 - box.left;
  const y = card.top + card.height / 2 - box.top;
  return x >= 0 && y >= 0 && x <= box.width && y <= box.height ? `${x}px ${y}px` : null;
}

/**
 * The item view grows out of where its card sat, by transform and opacity
 * only. The library stops painting while a page covers it, so a flight back
 * into the card would cross an empty frame; closing is instant instead.
 */
export function useOpenMotion(id: string, viewRef: RefObject<HTMLElement | null>) {
  const play = useEffectEvent(() => {
    const view = viewRef.current;
    if (!view || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Set outside the keyframes: an animated transform-origin would keep the animation off the compositor.
    view.style.transformOrigin = cardCenter(view, id) ?? "50% 50%";
    view.animate(
      [
        { opacity: 0, transform: "scale(0.94)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: 220,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
    );
  });
  // Only the first item grows in; one opened from Similar replaces it in place.
  useLayoutEffect(() => play(), []);
}
