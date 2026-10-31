import * as stylex from "@stylexjs/stylex";

// The only file allowed to hold color values. Components pick a role, never a hex.
// Roles are named for what they mark, so a surface never borrows an ink color.
export const color = stylex.defineVars({
  // Also apps/desktop/src/chrome.ts, which paints it before the first frame.
  window: "#0c0c0b",
  app: "#0a0a09",
  frame: "#0d0c0b",
  sunken: "#100f0e",
  surface: "#161412",
  raised: "#1b1917",
  hover: "#221f1c",
  border: "#262221",
  borderStrong: "#3a3531",

  ink: "#e5ddd2",
  inkStrong: "#f0e9df",
  inkSoft: "#c9c1b6",
  muted: "#8d867c",
  faint: "#5e5850",

  accent: "#b0714f",
  accentStrong: "#c27f5b",
  accentSoft: "#241c16",
  onAccent: "#faf6f0",
  danger: "#d07055",
  dangerSoft: "rgba(208, 112, 85, 0.14)",
  success: "#7fa08d",
  successSoft: "#26332c",

  paperBlue: "#243136",
  paperGreen: "#26332c",
  paperYellow: "#3a3524",

  glass: "rgba(12, 11, 10, 0.62)",
  glassEdge: "rgba(255, 255, 255, 0.08)",
  overlayHover: "rgba(255, 255, 255, 0.04)",
  overlayActive: "rgba(255, 255, 255, 0.08)",
  scrim: "rgba(0, 0, 0, 0.5)",
  shadow: "rgba(0, 0, 0, 0.55)",
});

export const spaceColor = stylex.defineVars({
  orange: "#b0714f",
  green: "#7f9a8c",
  blue: "#8e9bbf",
  pink: "#c98b8b",
  purple: "#a88ab5",
  yellow: "#c9b27a",
});

// Body text is each system's own UI face; display, numbers and quotes are bundled
// so headings look the same on all three systems.
export const font = stylex.defineVars({
  body: 'system-ui, -apple-system, "Segoe UI", "Noto Sans", sans-serif',
  display: '"DM Sans Variable", system-ui, sans-serif',
  mono: '"DM Mono", ui-monospace, "SF Mono", Consolas, monospace',
  quote: '"Libre Baskerville", Georgia, serif',
});

// A modular scale on a 13px base, the size of a sidebar row.
export const text = stylex.defineVars({
  xs: "11px",
  sm: "12px",
  md: "13px",
  lg: "15px",
  xl: "18px",
  xxl: "24px",
  display: "32px",
});

// A 4px grid.
export const space = stylex.defineVars({
  s1: "4px",
  s2: "8px",
  s3: "12px",
  s4: "16px",
  s5: "20px",
  s6: "24px",
  s8: "32px",
  s10: "40px",
  s12: "48px",
});

export const radius = stylex.defineVars({
  control: "9px",
  tile: "12px",
  panel: "14px",
  frame: "16px",
  card: "20px",
  overlay: "24px",
  round: "999px",
});

// Durations drop to zero under the system's reduced-motion setting, so no
// component has to check it.
const reduced = "@media (prefers-reduced-motion: reduce)";
export const motion = stylex.defineVars({
  micro: { default: "150ms", [reduced]: "0s" },
  mascot: { default: "250ms", [reduced]: "0s" },
  layout: { default: "300ms", [reduced]: "0s" },
  delight: { default: "400ms", [reduced]: "0s" },
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  enter: "cubic-bezier(0.2, 0, 0, 1)",
});

export const layout = stylex.defineVars({
  titlebar: "32px",
  sidebar: "232px",
});
