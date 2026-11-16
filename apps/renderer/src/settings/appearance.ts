import { createAtom, useSelector } from "@tanstack/react-store";
import { type Appearance, parseAppearance } from "./appearanceModel.ts";

function readAppearance() {
  try {
    return parseAppearance(localStorage.getItem("appearance"));
  } catch {
    return parseAppearance(null);
  }
}

const appearance = createAtom(readAppearance());

export const useAppearance = () => useSelector(appearance);

export function setAppearance<Key extends keyof Appearance>(key: Key, value: Appearance[Key]) {
  appearance.set((current) => ({ ...current, [key]: value }));
  try {
    localStorage.setItem("appearance", JSON.stringify(appearance.get()));
  } catch {}
}
