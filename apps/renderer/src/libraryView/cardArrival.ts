const easeOut = "cubic-bezier(0.215, 0.61, 0.355, 1)";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const entranceDelay = (down: number, across: number) =>
  Math.min(160, Math.max(0, (down + across) * 0.2 * 1000));
export const inViewport = (
  card: { top: number; bottom: number },
  view: { top: number; bottom: number },
) => card.bottom > view.top && card.top < view.bottom;

/** The first cards a grid shows rise in from its top-left corner. */
export function animateArrival(element: HTMLElement) {
  if (reduced()) return [];
  const view = (element.parentElement ?? element).getBoundingClientRect();
  return [...element.querySelectorAll<HTMLElement>('[data-bench="card"]')]
    .filter((card) => inViewport(card.getBoundingClientRect(), view))
    .map((card) => {
      const rect = card.getBoundingClientRect();
      const animation = card.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: 240,
          delay: entranceDelay(
            (rect.top - view.top) / view.height,
            (rect.left - view.left) / view.width,
          ),
          easing: easeOut,
          fill: "both",
        },
      );
      // Released once done, so the card's own hover transform applies again.
      void animation.finished.then(
        () => animation.cancel(),
        () => {},
      );
      return animation;
    });
}
