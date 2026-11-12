import { useEffect, useRef } from "react";

/**
 * Keeps one fill behind the row marked `data-sidebar-selected` inside the track, so the
 * selection slides between rows. It follows the DOM, not React state: rows reorder, scroll
 * and swap for the compact rail without telling the sidebar.
 */
export function useSelectionPill() {
  const track = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const area = track.current;
    const fill = pill.current;
    if (!area || !fill) return;
    let shown = false;
    const place = (glide: boolean) => {
      const row = area.querySelector<HTMLElement>("[data-sidebar-selected]");
      if (!row) {
        shown = false;
        fill.style.opacity = "0";
        return;
      }
      // offsetTop ignores a dragged row's transform, so the fill waits in the row's slot.
      let top = row.offsetTop;
      let above = 0;
      let below = 0;
      for (let box = row.parentElement; box && box !== area; box = box.parentElement) {
        if (box.scrollHeight <= box.clientHeight) continue;
        top -= box.scrollTop;
        above = Math.max(0, box.offsetTop - top);
        below = Math.max(0, top + row.offsetHeight - box.offsetTop - box.clientHeight);
      }
      // A row scrolled half out of its list keeps only the half of the fill that is inside.
      fill.style.clipPath = above || below ? `inset(${above}px 0 ${below}px 0)` : "";
      fill.style.transitionProperty = glide && shown ? "" : "opacity";
      fill.style.height = `${row.offsetHeight}px`;
      fill.style.transform = `translateY(${top}px)`;
      fill.style.opacity = above + below >= row.offsetHeight ? "0" : "1";
      shown = true;
    };
    place(false);
    const changes = new MutationObserver(() => place(true));
    changes.observe(area, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-sidebar-selected"],
    });
    const sizes = new ResizeObserver(() => place(false));
    sizes.observe(area);
    const follow = () => place(false);
    // Scroll does not bubble, so the lists inside are heard on the way down.
    area.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => {
      changes.disconnect();
      sizes.disconnect();
      area.removeEventListener("scroll", follow, { capture: true });
    };
  }, []);

  return [track, pill] as const;
}
