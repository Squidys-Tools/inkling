export const appearanceOptions = {
  viewToggle: [
    { value: "pill", label: "Pill" },
    { value: "segmented", label: "Segmented" },
  ],
  sidebarToggle: [
    { value: "buttons", label: "Buttons" },
    { value: "edge", label: "Edge grip" },
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
    sidebarToggle: stored.sidebarToggle === "edge" ? "edge" : "buttons",
  };
}
