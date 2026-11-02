import { useLayoutEffect, useRef, useState } from "react";
import { sidebarClip, sidebarFlight } from "./sidebarGeometry.ts";

/** Reflow once to the destination, then move that frame on the compositor.
 * The old width/left transitions resized every retained library card each frame.
 */
export function useSidebarMotion(open: boolean, inset: number, narrow: boolean) {
  const stage = useRef<HTMLElement>(null);
  const previousInset = useRef(inset);
  const flight = useRef<Animation | null>(null);
  const edgeFlight = useRef<Animation | null>(null);
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
    const options = {
      duration: skip ? 0 : parseFloat(timing.transitionDuration) * 1000,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    };
    const sidebar = document.getElementById("library-navigation");
    edgeFlight.current?.cancel();
    edgeFlight.current = null;
    if (sidebar && !narrow) {
      const width = sidebar.offsetWidth;
      const radius = getComputedStyle(sidebar).borderTopRightRadius;
      const clip = (left: number) =>
        `inset(0px ${sidebarClip(left, width)}px 0px 0px round 0px ${radius} ${radius} 0px)`;
      // Clip the retained content, not its layout: the rounded edge and gap
      // follow the frame without popping from full width to the compact rail.
      edgeFlight.current = sidebar.animate(
        [{ clipPath: clip(inset + from.x) }, { clipPath: clip(inset) }],
        { ...options, fill: "both" },
      );
    }
    const animation = element.animate(
      [
        {
          transform: `translateX(${from.x}px) scaleX(${from.scale})`,
        },
        { transform: "none" },
      ],
      options,
    );
    flight.current = animation;
    void animation.finished.then(
      () => {
        if (flight.current !== animation) return;
        flight.current = null;
        // A settled open sidebar must not keep a clip that could outlive the flight.
        if (open) {
          edgeFlight.current?.cancel();
          edgeFlight.current = null;
        }
        // Keep the expanded navigation behind the moving frame until it is covered.
        setPresentation((current) =>
          current.requested === open ? { requested: open, retained: open } : current,
        );
      },
      () => {},
    );
  }, [open, inset, narrow]);

  // After each commit, release the held clip once the rail has settled.
  useLayoutEffect(() => {
    if (!flight.current) {
      edgeFlight.current?.cancel();
      edgeFlight.current = null;
    }
  });

  useLayoutEffect(
    () => () => {
      flight.current?.cancel();
      edgeFlight.current?.cancel();
    },
    [],
  );
  return [stage, open || presentation.retained] as const;
}
