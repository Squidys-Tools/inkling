import { useEffect, useRef } from "react";
import { glide } from "./useReorderGlide.ts";

/**
 * The selected row draws its own `[data-selection-fill]`, so the fill scrolls and drags with it.
 * When the selection moves to another row inside the track, the new fill glides from the old row.
 */
export function useSelectionGlide() {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = track.current;
    if (!area) return;
    let fill = area.querySelector<HTMLElement>("[data-selection-fill]");
    let row = fill?.parentElement ?? null;
    // Runs after React commits and before paint; the old row is still where it was painted.
    const changes = new MutationObserver(() => {
      const next = area.querySelector<HTMLElement>("[data-selection-fill]");
      if (next === fill) return;
      const was = row?.isConnected ? row.getBoundingClientRect().top : null;
      fill = next;
      row = next?.parentElement ?? null;
      if (next && was !== null)
        glide(next, was - next.getBoundingClientRect().top, 0, 200, "selection");
    });
    changes.observe(area, { subtree: true, childList: true });
    return () => changes.disconnect();
  }, []);

  return track;
}
