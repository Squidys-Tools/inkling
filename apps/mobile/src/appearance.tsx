import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { colors, fieldnotesColors, type Palette } from "./colors";

export type Look = "inkling" | "fieldnotes";
const key = "inkling.appearance";
const AppearanceContext = createContext<{
  look: Look;
  colors: Palette;
  setLook: (look: Look) => void;
} | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [look, updateLook] = useState<Look>("inkling");
  const chosen = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(key).then(
      (saved) => {
        if (live && !chosen.current && saved === "fieldnotes") updateLook(saved);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  const setLook = (next: Look) => {
    chosen.current = true;
    updateLook(next);
    // Serialize writes so rapid switches cannot persist an older choice last.
    writes.current = writes.current.then(() => SecureStore.setItemAsync(key, next)).catch(() => {});
  };
  return (
    <AppearanceContext.Provider
      value={{ look, colors: look === "fieldnotes" ? fieldnotesColors : colors, setLook }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance needs an AppearanceProvider");
  return value;
}

export function useThemedStyles<T>(factory: (palette: Palette) => T) {
  const { colors } = useAppearance();
  return useMemo(() => factory(colors), [colors, factory]);
}
