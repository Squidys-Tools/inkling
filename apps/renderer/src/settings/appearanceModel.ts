export const appearanceOptions = {
  // The compact rail is the same in both: Shelf is a look of the expanded sidebar.
  sidebar: [
    { value: "refined", label: "Rows" },
    { value: "shelf", label: "Shelf" },
  ],
  viewToggle: [
    { value: "pill", label: "Pill" },
    { value: "segmented", label: "Segmented" },
  ],
  // Windows and Linux only: macOS keeps its traffic lights and has no caption pill.
  windowControlsAtRest: [
    { value: "hover", label: "On hover" },
    { value: "always", label: "Always" },
  ],
} as const;

export type Appearance = {
  [Key in keyof typeof appearanceOptions]: (typeof appearanceOptions)[Key][number]["value"];
};

// Earlier builds stored `sidebarStyle` and `sidebarToggle`; neither is read, so an old choice picks no sidebar.
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
    sidebar: stored.sidebar === "shelf" ? "shelf" : "refined",
    viewToggle:
      viewToggleStyle === "pill" || viewToggleStyle === "segmented"
        ? viewToggleStyle
        : stored.viewToggle === "segmented"
          ? "segmented"
          : "pill",
    windowControlsAtRest: stored.windowControlsAtRest === "always" ? "always" : "hover",
  };
}
