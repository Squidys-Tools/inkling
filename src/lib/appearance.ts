import { useCallback, useEffect, useState } from "react";

// Settings → Appearance: alternative looks for components, kept side by side
// while we compare them. The first option of each is the default. When one
// wins, delete the others and its entry here.
export const APPEARANCE_OPTIONS = {
  viewToggle: [
    { value: "pill", label: "Pill" },
    { value: "segmented", label: "Segmented" },
  ],
} as const;

export type Appearance = {
  [Key in keyof typeof APPEARANCE_OPTIONS]: (typeof APPEARANCE_OPTIONS)[Key][number]["value"];
};

const STORAGE_KEY = "appearance";

function loadAppearance(): Appearance {
  let stored: Record<string, unknown> = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    // Unreadable or missing storage keeps the defaults.
  }
  const pick = <Key extends keyof Appearance>(key: Key): Appearance[Key] => {
    const options = APPEARANCE_OPTIONS[key];
    return (options.find((option) => option.value === stored[key]) ?? options[0]).value;
  };
  return { viewToggle: pick("viewToggle") };
}

export function useAppearance() {
  const [appearance, setAppearance] = useState(loadAppearance);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      return;
    }
  }, [appearance]);
  const setOption = useCallback(
    <Key extends keyof Appearance>(key: Key, value: Appearance[Key]) =>
      setAppearance((current) => ({ ...current, [key]: value })),
    [],
  );
  return [appearance, setOption] as const;
}
