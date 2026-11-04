import { useLayoutEffect, useRef, useState } from "react";
import {
  sidebarClip,
  sidebarCompact,
  sidebarExpanded,
  sidebarLabelFrames,
} from "./sidebarGeometry.ts";

/** Move real frame bounds without stretching images or exposing empty strips.
 * The grid commits responsive column changes only at their actual boundary.
 */
export function useSidebarMotion(open: boolean, inset: number, narrow: boolean) {
  const stage = useRef<HTMLElement>(null);
  const previous = useRef({ inset, open, narrow });
  const flight = useRef<Animation | null>(null);
  const edgeFlight = useRef<Animation | null>(null);
  const labelsFlight = useRef<Animation[]>([]);
  const [presentation, setPresentation] = useState({ requested: open, retained: open });
  if (presentation.requested !== open) {
    setPresentation({ requested: open, retained: open || presentation.retained });
  }

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const old = previous.current;
    previous.current = { inset, open, narrow };
    const timing = getComputedStyle(element);
    // An active left animation survives React's destination style commit.
    const fromLeft = flight.current ? parseFloat(timing.left) : old.inset;
    const sidebar = document.getElementById("library-navigation");
    const oldWidth = (old.open ? sidebarExpanded : sidebarCompact) - 8;
    const clip = sidebar ? getComputedStyle(sidebar).clipPath : "none";
    const clipped = clip.match(/^inset\(\s*[\d.]+px\s+([\d.]+)px/);
    const fromEdge =
      edgeFlight.current && sidebar ? sidebar.offsetWidth - Number(clipped?.[1] ?? 0) : oldWidth;
    const labels = sidebar
      ? [...sidebar.querySelectorAll<HTMLElement>("[data-sidebar-label]")]
      : [];
    const labelOpacity = labels.map((node) => Number(getComputedStyle(node).opacity));
    const reversing = flight.current !== null;
    flight.current?.cancel();
    edgeFlight.current?.cancel();
    labelsFlight.current.forEach((animation) => animation.cancel());
    labelsFlight.current = [];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const changed = old.open !== open || old.inset !== inset;
    const options = {
      duration: changed && !reduced ? parseFloat(timing.transitionDuration) * 1000 || 300 : 0,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    };
    if (sidebar) {
      const width = sidebar.offsetWidth;
      const radius = getComputedStyle(sidebar).borderTopRightRadius;
      const clipAt = (edge: number) =>
        `inset(0px ${sidebarClip(edge + 8, width)}px 0px 0px round 0px ${radius} ${radius} 0px)`;
      const targetEdge = (open ? sidebarExpanded : sidebarCompact) - 8;
      edgeFlight.current = sidebar.animate(
        [{ clipPath: clipAt(fromEdge) }, { clipPath: clipAt(targetEdge) }],
        { ...options, fill: "both" },
      );
      // Expanded-only labels should arrive, not appear as sliced full words.
      if (options.duration) {
        labelsFlight.current = labels.map((node, index) =>
          node.animate(sidebarLabelFrames(labelOpacity[index], open, reversing), {
            ...options,
            fill: "both",
          }),
        );
      }
    }
    // Move real bounds; a transform here stretched images.
    const animation = element.animate([{ left: `${fromLeft}px` }, { left: `${inset}px` }], options);
    flight.current = animation;
    void animation.finished.then(
      () => {
        if (flight.current !== animation) return;
        flight.current = null;
        if (open) {
          labelsFlight.current.forEach((item) => item.cancel());
          labelsFlight.current = [];
          edgeFlight.current?.cancel();
          edgeFlight.current = null;
        }
        setPresentation((current) =>
          current.requested === open ? { requested: open, retained: open } : current,
        );
      },
      () => {},
    );
  }, [open, inset, narrow]);

  useLayoutEffect(() => {
    if (!flight.current) {
      edgeFlight.current?.cancel();
      edgeFlight.current = null;
      labelsFlight.current.forEach((item) => item.cancel());
      labelsFlight.current = [];
    }
  });

  useLayoutEffect(
    () => () => {
      flight.current?.cancel();
      edgeFlight.current?.cancel();
      labelsFlight.current.forEach((animation) => animation.cancel());
    },
    [],
  );
  return [stage, open || presentation.retained] as const;
}
