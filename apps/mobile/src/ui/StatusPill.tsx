import { StyleSheet, Text, View } from "react-native";
import { useAppearance } from "../appearance";
import type { Palette } from "../colors";

export type Connection = "connected" | "connecting" | "offline" | "repair";

const tones: Record<Connection, { label: string; color: keyof Palette }> = {
  connected: { label: "Connected", color: "success" },
  connecting: { label: "Connecting", color: "warning" },
  offline: { label: "Desktop offline", color: "muted" },
  repair: { label: "Pair again", color: "danger" },
};

export function StatusPill({ connection }: { connection: Connection }) {
  const { colors, look } = useAppearance();
  const tone = tones[connection];
  const color = colors[tone.color];
  return (
    <View style={[styles.pill, { borderColor: color }, look === "fieldnotes" && styles.quiet]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  quiet: { borderWidth: 0, paddingHorizontal: 0 },
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
