import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

const noSubscription = () => () => {};

// The prerendered page is the static state; React publishes the browser snapshot after hydration.
export const useHydrated = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

export function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const CalmContext = createContext(false);

export function useCalm() {
  // The prerendered page is fully revealed and still.
  const system = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const chosen = useContext(CalmContext);
  return system || chosen;
}
