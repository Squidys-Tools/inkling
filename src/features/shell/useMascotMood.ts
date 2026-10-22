import { useEffect, useState } from "react";
import { pushMascotParams } from "../../components/mascot/mascotStore";
import type { LibraryItem } from "../../lib/types";

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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
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
