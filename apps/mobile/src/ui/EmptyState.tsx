// Adapted from t3code's apps/mobile/src/components/ui/EmptyState.tsx (MIT, Copyright (c) 2026 T3 Tools Inc.).
import { StyleSheet, View } from "react-native";
import { colors } from "../colors";
import { AppText } from "./AppText";
import { Button } from "./Button";

export function EmptyState(props: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <AppText variant="title" style={styles.title}>
        {props.title}
      </AppText>
      <AppText style={styles.detail}>{props.detail}</AppText>
      {props.actionLabel && props.onAction ? (
        <View style={styles.action}>
          <Button tone="primary" label={props.actionLabel} onPress={props.onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", paddingHorizontal: 32, paddingVertical: 48 },
  title: { color: colors.title, textAlign: "center" },
  detail: { color: colors.muted, textAlign: "center", marginTop: 8 },
  action: { marginTop: 20 },
});
