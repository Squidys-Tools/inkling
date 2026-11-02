import { useLayoutEffect, useRef, useState } from "react";
import { sidebarFlight } from "./sidebarGeometry.ts";

/** Reflow once to the destination, then move that frame on the compositor.
 * The old width/left transitions resized every retained library card each frame.
 */
export function useSidebarMotion(open: boolean, inset: number, narrow: boolean) {
  const stage = useRef<HTMLElement>(null);
  const previousInset = useRef(inset);
  const flight = useRef<Animation | null>(null);
  const [presentation, setPresentation] = useState({ requested: open, retained: open });
  if (presentation.requested !== open) {
    setPresentation({ requested: open, retained: open || presentation.retained });
  }

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const oldInset = previousInset.current;
    previousInset.current = inset;
    const timing = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(
      timing.transform === "none" ? undefined : timing.transform,
    );
    // A reversing flight starts at its currently painted bounds, not its old endpoint.
    // Use the real gutter: the old viewport-wide estimate overshot by 8px.
    const from = sidebarFlight(
      oldInset,
      inset,
      innerWidth,
      element.offsetWidth,
      matrix,
      parseFloat(timing.right) || 0,
    );
    flight.current?.cancel();
    flight.current = null;
    const skip =
      oldInset === inset || narrow || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = element.animate(
      [
        {
          transform: `translateX(${from.x}px) scaleX(${from.scale})`,
        },
        { transform: "none" },
      ],
      {
        duration: skip ? 0 : parseFloat(timing.transitionDuration) * 1000,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
    );
    flight.current = animation;
    void animation.finished.then(
      () => {
        if (flight.current !== animation) return;
        flight.current = null;
        // Keep the expanded navigation behind the moving frame until it is covered.
        setPresentation((current) =>
          current.requested === open ? { requested: open, retained: open } : current,
        );
      },
      () => {},
    );
  }, [open, inset, narrow]);

  useLayoutEffect(
    () => () => {
      flight.current?.cancel();
    },
    [],
  );
  return [stage, open || presentation.retained] as const;
}
