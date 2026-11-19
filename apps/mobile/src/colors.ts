// Desktop inkling's palette (packages/ui/src/tokens.stylex.ts), as plain values for React Native.
// The only mobile file allowed to hold color values.
export const colors = {
  window: "#0c0c0b",
  background: "#0a0a09",
  sunken: "#100f0e",
  surface: "#161412",
  raised: "#1b1917",
  border: "#262221",
  borderStrong: "#3a3531",
  text: "#e5ddd2",
  title: "#f0e9df",
  inkSoft: "#c9c1b6",
  muted: "#8d867c",
  faint: "#5e5850",
  placeholder: "#5e5850",
  placeholderSurface: "#1b1917",
  accent: "#c27f5b",
  accentDeep: "#b0714f",
  accentSoft: "#241c16",
  success: "#7fa08d",
  warning: "#c9b27a",
  danger: "#d07055",
  paperYellow: "#3a3524",
  articlePaper: "#ece6dc",
  articleInk: "#1a1714",
  articleMuted: "#7a7268",
  articleRule: "rgba(26, 23, 20, 0.12)",
  quoteKicker: "#b3ad8d",
  quoteMark: "#c4ba8c",
  quoteText: "#d0c68f",
  quoteRule: "#81764c",
  postPaper: "#08090a",
  postInk: "#e7e9ea",
  postMuted: "#71767b",
  postAvatar: "#2f3336",
  postRule: "rgba(231, 233, 234, 0.14)",
  postLink: "#1d9bf0",
  stage: "#121110",
  stageDot: "#2a2623",
  badge: "rgba(14, 14, 12, 0.72)",
  badgeInk: "#d8d2c6",
} as const;

// Desktop's Space swatches (spaceColor in tokens.stylex.ts).
export const spaceColors = {
  orange: "#b0714f",
  green: "#7f9a8c",
  blue: "#8e9bbf",
  pink: "#c98b8b",
  purple: "#a88ab5",
  yellow: "#c9b27a",
} as const;

// The same swatches as faint fills, for Space rows in the sidebar.
export const spaceTints = {
  orange: "rgba(176, 113, 79, 0.16)",
  green: "rgba(127, 154, 140, 0.16)",
  blue: "rgba(142, 155, 191, 0.16)",
  pink: "rgba(201, 139, 139, 0.16)",
  purple: "rgba(168, 138, 181, 0.16)",
  yellow: "rgba(201, 178, 122, 0.16)",
} as const;
