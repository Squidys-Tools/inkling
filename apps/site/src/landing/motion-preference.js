import { useSyncExternalStore } from "react";
const query = "(prefers-reduced-motion: reduce)";
const subscribe = (notify) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => window.matchMedia(query).matches;
// Stable, fully revealed SSR; browser preference remains reactive after load.
export const useMotionPreference = () => useSyncExternalStore(subscribe, snapshot, () => true);
