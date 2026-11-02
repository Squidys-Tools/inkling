import { createStore, useStore } from "../library/store.ts";

export const viewToggleStyles = [
  { value: "pill", label: "Pill" },
  { value: "segmented", label: "Segmented" },
] as const;

export type ViewToggleStyle = (typeof viewToggleStyles)[number]["value"];

const storageKey = "view-toggle-style";

const isStyle = (value: string | null): value is ViewToggleStyle =>
  viewToggleStyles.some((style) => style.value === value);

function storedStyle(): ViewToggleStyle {
  try {
    const stored = localStorage.getItem(storageKey);
    if (isStyle(stored)) return stored;
  } catch {
    // Storage can be unavailable; the default style reads fine.
  }
  return "pill";
}

const store = createStore(storedStyle());

export const useViewToggleStyle = () => useStore(store, (style) => style);

export function setViewToggleStyle(style: ViewToggleStyle) {
  store.set(style);
  try {
    localStorage.setItem(storageKey, style);
  } catch {
    // The choice still holds for this session.
  }
}
