import { StyleSheet, Text, View } from "react-native";
import { colors } from "../colors";

export type Connection = "connected" | "connecting" | "offline" | "repair";

const tones: Record<Connection, { label: string; color: string }> = {
  connected: { label: "Connected", color: colors.success },
  connecting: { label: "Connecting", color: colors.warning },
  offline: { label: "Desktop offline", color: colors.muted },
  repair: { label: "Pair again", color: colors.danger },
};

export function StatusPill({ connection }: { connection: Connection }) {
  const tone = tones[connection];
  return (
    <View style={[styles.pill, { borderColor: tone.color }]}>
      <View style={[styles.dot, { backgroundColor: tone.color }]} />
      <Text style={[styles.label, { color: tone.color }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: "600" },
});
