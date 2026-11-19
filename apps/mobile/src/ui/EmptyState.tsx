import { Button, StyleSheet, Text, View } from "react-native";
import { colors } from "../colors";

export function EmptyState(props: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.detail}>{props.detail}</Text>
      {props.actionLabel && props.onAction ? (
        <Button title={props.actionLabel} onPress={props.onAction} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", paddingHorizontal: 32, paddingVertical: 48, gap: 8 },
  title: { color: colors.title, fontSize: 18, fontWeight: "600", textAlign: "center" },
  detail: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
