// Adapted from t3code's apps/mobile/src/components/ui/Notice.tsx (MIT, Copyright (c) 2026 T3 Tools Inc.).
import { SymbolView, type SFSymbol } from "expo-symbols";
import { type ReactNode, useEffect } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { colors } from "../colors";
import { AppText } from "./AppText";

export function Notice(props: {
  message: string;
  icon?: SFSymbol;
  tone?: "default" | "danger";
  action?: ReactNode;
}) {
  const danger = props.tone === "danger";
  useEffect(() => {
    // VoiceOver doesn't read live regions; it needs an explicit announcement.
    AccessibilityInfo.announceForAccessibility(props.message);
  }, [props.message]);
  return (
    <View style={styles.notice}>
      <View style={styles.row}>
        {props.icon ? (
          <SymbolView
            name={props.icon}
            size={16}
            tintColor={danger ? colors.danger : colors.muted}
            style={styles.icon}
          />
        ) : null}
        <AppText variant="footnote" style={styles.message}>
          {props.message}
        </AppText>
      </View>
      {props.action}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    gap: 10,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  icon: { marginTop: 2 },
  message: { flex: 1, minWidth: 0, color: colors.text },
});
