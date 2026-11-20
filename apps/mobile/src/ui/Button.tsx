// Adapted from t3code's apps/mobile/src/components/ui/Button.tsx (MIT, Copyright (c) 2026 T3 Tools Inc.).
import { SymbolView, type SFSymbol } from "expo-symbols";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { colors } from "../colors";
import { AppText } from "./AppText";

const tones = {
  primary: { fill: colors.accent, ink: colors.window },
  secondary: { fill: colors.raised, ink: colors.title },
  danger: { fill: colors.raised, ink: colors.danger },
  text: { fill: "transparent", ink: colors.accent },
} as const;

export function Button(props: {
  label: string;
  onPress: () => void;
  icon?: SFSymbol;
  tone?: keyof typeof tones;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  const tone = tones[props.tone ?? "secondary"];
  const disabled = Boolean(props.disabled || props.loading);
  const ink = disabled ? colors.muted : tone.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled, busy: Boolean(props.loading) }}
      disabled={disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled && props.tone !== "text" ? colors.raised : tone.fill },
        props.fullWidth ? styles.full : styles.fit,
        pressed && styles.pressed,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={colors.muted} />
      ) : props.icon ? (
        <SymbolView name={props.icon} size={18} tintColor={ink} />
      ) : null}
      <AppText style={[styles.label, { color: ink }]}>{props.label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  full: { alignSelf: "stretch" },
  fit: { alignSelf: "center" },
  pressed: { opacity: 0.7 },
  label: { fontWeight: "600", textAlign: "center", flexShrink: 1 },
});
