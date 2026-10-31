import * as stylex from "@stylexjs/stylex";

// The reader's type, which each font set in fontSets.ts overrides as a theme.
// The defaults are Quiet Classic.
export const reader = stylex.defineVars({
  heading: '"Crimson Pro", Georgia, serif',
  body: '"Source Serif 4", Georgia, serif',
  quote: '"Newsreader", Georgia, serif',
  list: '"Lora", Georgia, serif',
  meta: 'system-ui, -apple-system, "Segoe UI", "Noto Sans", sans-serif',
  headingWeight: "600",
  headingTracking: "-0.01em",
  bodySize: "19px",
  quoteBackground: "transparent",
});
