import { Button, StyleSheet, Text, View } from "react-native";
import { useAppearance, useThemedStyles } from "../appearance";
import type { Palette } from "../colors";

export function EmptyState(props: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors, look } = useAppearance();
  return (
    <View style={styles.empty}>
      <Text
        style={[
          styles.title,
          look === "fieldnotes" && { fontFamily: "Georgia", fontSize: 28, fontWeight: "400" },
        ]}
      >
        {props.title}
      </Text>
      <Text style={styles.detail}>{props.detail}</Text>
      {props.actionLabel && props.onAction ? (
        <Button title={props.actionLabel} onPress={props.onAction} color={colors.accent} />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    empty: { alignItems: "center", paddingHorizontal: 32, paddingVertical: 48, gap: 8 },
    title: { color: colors.title, fontSize: 18, fontWeight: "600", textAlign: "center" },
    detail: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  });
