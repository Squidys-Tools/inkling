import { createStore, useStore } from "../library/store.ts";

export const viewToggleStyles = [
  { value: "pill", label: "Pill" },
  { value: "segmented", label: "Segmented" },
] as const;

export type ViewToggleStyle = (typeof viewToggleStyles)[number]["value"];

const storageKey = "view-toggle-style";

const isStyle = (value: string | null): value is ViewToggleStyle =>
  viewToggleStyles.some((style) => style.value === value);

// Read on first use: the marketing site imports this module on a server with no localStorage.
let current: ReturnType<typeof createStore<ViewToggleStyle>> | undefined;

function store() {
  if (current) return current;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(storageKey);
  } catch {
    // Storage can be unavailable; the default style reads fine.
  }
  current = createStore<ViewToggleStyle>(isStyle(stored) ? stored : "pill");
  return current;
}

export const useViewToggleStyle = () => useStore(store(), (style) => style);

export function setViewToggleStyle(style: ViewToggleStyle) {
  store().set(style);
  try {
    localStorage.setItem(storageKey, style);
  } catch {
    // The choice still holds for this session.
  }
}
