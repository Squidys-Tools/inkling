import { useSyncExternalStore } from "react";

/** What a mascot player needs from the page: whether to move, and a frame clock. */
export type MotionEnvironment = {
  reducedMotion: () => boolean;
  hidden: () => boolean;
  requestFrame: (callback: (ms: number) => void) => number;
  cancelFrame: (handle: number) => void;
  /** Calls `listener` when reduced motion or page visibility changes. */
  subscribe: (listener: () => void) => () => void;
};

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export const browserMotion: MotionEnvironment = {
  reducedMotion: () => reducedMotionQuery.matches,
  hidden: () => document.hidden,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  subscribe: (listener) => {
    reducedMotionQuery.addEventListener("change", listener);
    document.addEventListener("visibilitychange", listener);
    return () => {
      reducedMotionQuery.removeEventListener("change", listener);
      document.removeEventListener("visibilitychange", listener);
    };
  },
};

const subscribeReducedMotion = (listener: () => void) => {
  reducedMotionQuery.addEventListener("change", listener);
  return () => reducedMotionQuery.removeEventListener("change", listener);
};

export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => reducedMotionQuery.matches);
}
