import { useSyncExternalStore } from "react";
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;
// SSR is the readable static state; React publishes the browser snapshot after hydration.
export const useHydrated = () =>
  useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
const hoverQuery = "(hover: hover) and (pointer: fine)";
const subscribeHover = (notify) => {
  const q = window.matchMedia(hoverQuery);
  q.addEventListener("change", notify);
  return () => q.removeEventListener("change", notify);
};
const hoverSnapshot = () => window.matchMedia(hoverQuery).matches;
export const useHoverCapable = () =>
  useSyncExternalStore(subscribeHover, hoverSnapshot, serverHydrated);
const tallQuery = "(min-height: 760px)";
const subscribeTall = (notify) => {
  const q = window.matchMedia(tallQuery);
  q.addEventListener("change", notify);
  return () => q.removeEventListener("change", notify);
};
const tallSnapshot = () => window.matchMedia(tallQuery).matches;
export const useTallViewport = () =>
  useSyncExternalStore(subscribeTall, tallSnapshot, serverHydrated);
