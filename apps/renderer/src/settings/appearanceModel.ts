export const appearanceOptions = {
  // The compact rail is the same in both: Cover and Strip are looks of the expanded sidebar.
  sidebar: [
    { value: "cover", label: "Cover" },
    { value: "strip", label: "Strip" },
  ],
  viewToggle: [
    { value: "pill", label: "Pill" },
    { value: "segmented", label: "Segmented" },
  ],
  gridColumns: [
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "5", label: "5" },
    { value: "6", label: "6" },
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
    // Strip replaced Shelf, so a stored Shelf choice keeps the picture-led sidebar.
    sidebar: stored.sidebar === "strip" || stored.sidebar === "shelf" ? "strip" : "cover",
    viewToggle:
      viewToggleStyle === "pill" || viewToggleStyle === "segmented"
        ? viewToggleStyle
        : stored.viewToggle === "segmented"
          ? "segmented"
          : "pill",
    gridColumns:
      appearanceOptions.gridColumns.find((option) => option.value === stored.gridColumns)?.value ??
      "4",
    windowControlsAtRest: stored.windowControlsAtRest === "always" ? "always" : "hover",
  };
}
