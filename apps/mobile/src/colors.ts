// The mobile spike's palette, kept in one file until mobile maps the shared design tokens.
export const colors = {
  background: "#0a0a09",
  title: "#f0e9df",
  surface: "#161412",
  accent: "#c27f5b",
  text: "#e5ddd2",
  muted: "#c9c1b6",
  border: "#3a3531",
  placeholder: "#6b635b",
  placeholderSurface: "#24201d",
  success: "#7fb77e",
  warning: "#d9a95b",
  danger: "#d9705b",
} as const;

export type Palette = { [Key in keyof typeof colors]: string };

export const fieldnotesColors: Palette = {
  background: "#f5f1e8",
  title: "#243b32",
  surface: "#fffcf5",
  accent: "#995134",
  text: "#2e3b34",
  muted: "#6a7064",
  border: "#d8d6c9",
  placeholder: "#797d71",
  placeholderSurface: "#e8e9dc",
  success: "#3e694b",
  warning: "#8b631f",
  danger: "#ae4033",
};
