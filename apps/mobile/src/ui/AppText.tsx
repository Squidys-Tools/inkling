// Adapted from t3code's apps/mobile/src/lib/typography.ts and components/ui/AppText.tsx
// (MIT, Copyright (c) 2026 T3 Tools Inc.), restyled with StyleSheet over inkling's palette.
import { StyleSheet, Text, type TextProps, useWindowDimensions } from "react-native";
import { colors } from "../colors";

const typography = StyleSheet.create({
  micro: { fontSize: 11, lineHeight: 14 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, lineHeight: 17 },
  footnote: { fontSize: 14, lineHeight: 19 },
  body: { fontSize: 16, lineHeight: 23 },
  headline: { fontSize: 18, lineHeight: 23, fontWeight: "600" },
  title: { fontSize: 21, lineHeight: 28, fontWeight: "600" },
});

export type TextRole = keyof typeof typography;

/** Text in one of the shared roles; it follows Dynamic Type like any system text. */
export function AppText({ variant = "body", style, ...props }: TextProps & { variant?: TextRole }) {
  return <Text style={[styles.base, typography[variant], style]} {...props} />;
}

/** Icons beside text grow with Dynamic Type, up to twice their size, so labels never dwarf them. */
export const useIconScale = () => Math.min(useWindowDimensions().fontScale, 2);

const styles = StyleSheet.create({ base: { color: colors.text } });
