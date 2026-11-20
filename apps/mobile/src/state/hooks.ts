import { RegistryContext } from "@effect/atom-react";
import { useContext, useEffect } from "react";
import { AppState } from "react-native";
import { loadSavedPairing, refreshLibrary, syncOutbox } from "./actions";

export const useRegistry = () => useContext(RegistryContext);

// A short trip to another app (the Share Sheet, Safari) only needs the outbox; a long one may have missed saves on desktop.
const STALE_AFTER = 10_000;

/** Reads the pairing once, then keeps the outbox and library current as the app comes and goes. */
export function useLibrarySync() {
  const registry = useRegistry();
  useEffect(() => {
    void loadSavedPairing(registry).then(() => syncOutbox(registry));
    let leftAt = 0;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") leftAt = Date.now();
      if (state !== "active") return;
      if (leftAt && Date.now() - leftAt >= STALE_AFTER) void refreshLibrary(registry);
      else void syncOutbox(registry);
    });
    return () => subscription.remove();
  }, [registry]);
}
