import type { WindowChrome } from "@inkling/contracts/desktop";

export const appearanceOptions = {
  viewToggle: [
    { value: "pill", label: "Pill" },
    { value: "segmented", label: "Segmented" },
  ],
  // Only macOS offers the choice; Windows and Linux always draw the inset pill.
  windowControls: [
    { value: "traffic-lights", label: "Traffic lights" },
    { value: "inset", label: "Inset pill" },
  ],
  windowControlsAtRest: [
    { value: "hover", label: "On hover" },
    { value: "always", label: "Always" },
  ],
} as const;

export type Appearance = {
  [Key in keyof typeof appearanceOptions]: (typeof appearanceOptions)[Key][number]["value"];
};

// Sidebar style is deliberately not a preference: Codex is the only sidebar.
export function parseAppearance(
  raw: string | null,
  viewToggleStyle: string | null = null,
): Appearance {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      stored = parsed as Record<string, unknown>;
  } catch {}
  return {
    viewToggle:
      viewToggleStyle === "pill" || viewToggleStyle === "segmented"
        ? viewToggleStyle
        : stored.viewToggle === "segmented"
          ? "segmented"
          : "pill",
    windowControls: stored.windowControls === "inset" ? "inset" : "traffic-lights",
    windowControlsAtRest: stored.windowControlsAtRest === "always" ? "always" : "hover",
  };
}

/** The caption style on screen: the inset pill takes over from macOS traffic lights when chosen. */
export function chromeControlsFor(
  base: WindowChrome["controls"],
  windowControls: Appearance["windowControls"],
): WindowChrome["controls"] {
  return base === "native-left" && windowControls === "inset" ? "custom-right" : base;
}
