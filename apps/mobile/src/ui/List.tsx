// Adapted from t3code's ListSection, ListRow and ListRowLayout in apps/mobile/src/components/ui
// (MIT, Copyright (c) 2026 T3 Tools Inc.), restyled with StyleSheet over inkling's palette.
import { SymbolView, type SFSymbol } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { colors } from "../colors";
import { AppText, useIconScale } from "./AppText";

export function ListSection(props: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {props.title ? (
        <AppText variant="footnote" style={styles.sectionTitle}>
          {props.title}
        </AppText>
      ) : null}
      <View style={styles.group}>{props.children}</View>
      {props.footer ? (
        <AppText variant="footnote" style={styles.footer}>
          {props.footer}
        </AppText>
      ) : null}
    </View>
  );
}

export function ListRow(props: {
  label: string;
  icon?: SFSymbol;
  leading?: ReactNode;
  description?: string;
  detail?: string;
  tone?: "default" | "danger";
  /** Rows that open a page show a chevron; actions don't. */
  navigates?: boolean;
  onPress?: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const iconSize = Math.round(22 * useIconScale());
  // At the largest text sizes the detail drops under the label instead of squeezing it.
  const stackDetail = fontScale >= 1.5;
  const ink = props.tone === "danger" ? colors.danger : colors.text;
  const body = (
    <View style={[styles.row, props.description ? styles.tall : null]}>
      {props.icon ? (
        <View style={styles.icon}>
          <SymbolView
            name={props.icon}
            size={iconSize}
            tintColor={props.tone === "danger" ? colors.danger : colors.inkSoft}
          />
        </View>
      ) : props.leading ? (
        <View style={styles.icon}>{props.leading}</View>
      ) : null}
      <View style={styles.text}>
        <AppText style={{ color: ink }}>{props.label}</AppText>
        {props.description ? (
          <AppText variant="footnote" style={styles.muted}>
            {props.description}
          </AppText>
        ) : null}
        {props.detail && stackDetail ? (
          <AppText variant="footnote" style={styles.muted}>
            {props.detail}
          </AppText>
        ) : null}
      </View>
      {props.detail && !stackDetail ? (
        <AppText variant="footnote" style={styles.detail} numberOfLines={1} ellipsizeMode="middle">
          {props.detail}
        </AppText>
      ) : null}
      {props.navigates ? (
        <SymbolView name="chevron.right" size={14} weight="semibold" tintColor={colors.faint} />
      ) : null}
    </View>
  );
  if (!props.onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[props.label, props.description, props.detail].filter(Boolean).join(", ")}
      onPress={props.onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { color: colors.muted, fontWeight: "500", paddingHorizontal: 8 },
  group: {
    backgroundColor: colors.raised,
    borderRadius: 24,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  footer: { color: colors.muted, paddingHorizontal: 16 },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tall: { minHeight: 72 },
  icon: { minWidth: 24, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 4 },
  muted: { color: colors.muted },
  detail: { color: colors.muted, maxWidth: "45%", flexShrink: 1, textAlign: "right" },
  pressed: { backgroundColor: colors.border },
});
