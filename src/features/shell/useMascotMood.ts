import { useEffect, useSyncExternalStore } from "react";
import { pushMascotParams } from "../../components/mascot/mascotStore";
import type { LibraryItem } from "../../lib/types";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

type MascotMoodOptions = {
  canUseDesktopBackend: boolean;
  activeJobCount: number | null;
  items: LibraryItem[];
  captureError: string | null;
  isSearchFocused: boolean;
  query: string;
};

export function useMascotMood({
  canUseDesktopBackend,
  activeJobCount,
  items,
  captureError,
  isSearchFocused,
  query,
}: MascotMoodOptions) {
  // Errors drop to idle so the sad face can show, since drift carries its own
  // fixed face.
  const isMascotBusy =
    canUseDesktopBackend && activeJobCount !== null
      ? activeJobCount > 0
      : items.some((item) => item.processing?.active);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  useEffect(() => {
    pushMascotParams({
      state: captureError
        ? "idle"
        : isMascotBusy
          ? "notify"
          : prefersReducedMotion
            ? "inkling-sway"
            : "inkling-drift",
      expression: captureError
        ? "triste"
        : isSearchFocused
          ? query
            ? "curieux"
            : "attentif"
          : "neutre",
    });
  }, [isMascotBusy, captureError, isSearchFocused, query, prefersReducedMotion]);
}
