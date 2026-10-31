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
  // Long-form writing in Focus Mode.
  writing: '"Source Serif 4", Georgia, serif',
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

// The mascot draws on a canvas, which takes concrete colors, not CSS variables,
// so these are constants. `body` is color.ink: the sidebar mascot is ink on the dark window.
export const mascotColor = stylex.defineConsts({
  body: "#e5ddd2",
  notification: "#3b93f0",
  portraitInk: "#2b2623",
  portraitPaper: "#e5ddd2",
});

// The library's card treatments and the controls around the grid. Each card kind
// keeps its own paper and ink, so these are roles of a card, not of the app.
export const cardColor = stylex.defineVars({
  articlePaper: "#ece6dc",
  articleInk: "#1a1714",
  articleMuted: "#7a7268",
  articleRule: "rgba(26, 23, 20, 0.12)",
  articleLine: "#4a4842",
  stampEdge: "#a06b4e",
  stampInk: "#d98d68",
  noteText: "#9fb1ae",
  noteKicker: "#9fb9b7",
  quoteKicker: "#b3ad8d",
  quoteMark: "#c4ba8c",
  quoteText: "#d0c68f",
  quoteRule: "#81764c",
  quoteEdge: "rgba(255, 255, 255, 0.04)",
  postPaper: "#edf4f5",
  postInk: "#243d42",
  postMuted: "#6b8589",
  postAvatarInk: "#e8f0f2",
  postRule: "rgba(36, 61, 66, 0.16)",
  embedPaper: "#ffffff",
  hoverShadow: "rgba(0, 0, 0, 0.4)",
  controlEdge: "#4a4842",
  tileMeta: "#6f685f",
  tileButton: "rgba(12, 12, 11, 0.72)",
  tileButtonHover: "rgba(12, 12, 11, 0.9)",
  deleteHover: "#3a251d",
  deleteInkHover: "#f0b095",
  dangerTool: "#e08a5e",
  dangerEdge: "rgba(208, 112, 85, 0.28)",
  dangerWash: "rgba(208, 112, 85, 0.06)",
  addHover: "#f2ece1",
  addHighlight: "rgba(255, 255, 255, 0.55)",
  addLowlight: "rgba(0, 0, 0, 0.08)",
  addShadow: "rgba(0, 0, 0, 0.35)",
  glassHighlight: "rgba(255, 255, 255, 0.1)",
  glassTopEdge: "rgba(255, 255, 255, 0.16)",
  glassBottomEdge: "rgba(255, 255, 255, 0.04)",
  glassInnerShade: "rgba(0, 0, 0, 0.3)",
  sidebarShadow: "rgba(0, 0, 0, 0.45)",
  sidebarScrim: "rgba(10, 10, 9, 0.48)",
  kbdEdge: "#3e3a36",
  roundControl: "#34302c",
  roundControlHover: "#45403a",
  dropWash: "rgba(176, 113, 79, 0.1)",
});

// The item view's stage, the reader and the note editor.
export const itemColor = stylex.defineVars({
  stage: "#121110",
  stageDot: "#2a2623",
  pdfPaper: "#ffffff",
  accentGlow: "rgba(176, 113, 79, 0.12)",
  accentTint: "rgba(176, 113, 79, 0.05)",
  mutedTint: "rgba(141, 134, 124, 0.08)",
  writingInk: "#e9e1d6",
  codeInk: "#c9d8c3",
  linkInk: "#d7a887",
  linkRule: "#6a4c39",
  quoteRule: "#9a684c",
  quoteInk: "#b6a999",
  tagInk: "#a8a096",
  swatchEdge: "rgba(229, 221, 210, 0.14)",
});

// The welcome screens' demos: a paper receipt read by a scan beam, and mini
// video cards with their play button and duration badge.
export const onboardingColor = stylex.defineVars({
  receiptPaper: "#f1eadc",
  receiptInk: "#3a332d",
  receiptStrong: "#2a2420",
  receiptMuted: "#7a7266",
  receiptRule: "#c9bfae",
  scanWash: "rgba(176, 113, 79, 0.32)",
  scanGlow: "rgba(176, 113, 79, 0.55)",
  matchWash: "rgba(176, 113, 79, 0.28)",
  deepShadow: "rgba(0, 0, 0, 0.7)",
  softShadow: "rgba(0, 0, 0, 0.45)",
  videoScrimTop: "rgba(12, 12, 10, 0.02)",
  videoScrimBottom: "rgba(12, 12, 10, 0.5)",
  playButton: "rgba(18, 18, 16, 0.78)",
  playInk: "#f2ede2",
  playEdge: "rgba(255, 255, 255, 0.22)",
  badge: "rgba(14, 14, 12, 0.72)",
  badgeInk: "#d8d2c6",
});
