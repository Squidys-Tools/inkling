import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../colors";
import { font } from "../fonts";
import { embedQuery, modelInstalled } from "../embedQuery";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";
import { StatusPill } from "../ui/StatusPill";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row(props: {
  label: string;
  value?: string;
  tone?: "danger" | "accent";
  onPress?: () => void;
}) {
  const label = (
    <Text
      style={[
        styles.label,
        props.tone === "danger" && styles.danger,
        props.tone === "accent" && styles.accent,
      ]}
    >
      {props.label}
    </Text>
  );
  const content = (
    <View style={styles.row}>
      {label}
      {props.value ? <Text style={styles.value}>{props.value}</Text> : null}
    </View>
  );
  return props.onPress ? (
    <Pressable accessibilityRole="button" onPress={props.onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function SettingsScreen({ navigation }: ScreenProps<"Settings">) {
  const library = useLibrary();
  const [modelCheck, setModelCheck] = useState("");
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>
      <Section title="Tailscale">
        <Row label="Status" value={library.tailscale.state} />
        <Row label="This phone" value={library.tailscale.ips?.[0] ?? "—"} />
      </Section>
      <Section title="Desktop">
        <View style={styles.row}>
          <Text style={styles.label}>Connection</Text>
          <StatusPill connection={library.connection} />
        </View>
        <Row label="Address" value={library.pairing?.address ?? "Not paired"} />
        {library.pairing ? (
          <Row
            label="Forget this desktop"
            tone="danger"
            onPress={() => library.forget().then(() => navigation.goBack())}
          />
        ) : (
          <Row
            label="Pair with a desktop"
            tone="accent"
            onPress={() => navigation.navigate("Pair")}
          />
        )}
      </Section>
      <Section title="On-device search">
        <Row
          label="Check the search model"
          tone="accent"
          value={modelCheck}
          onPress={async () => {
            if (!modelInstalled()) return setModelCheck("Not installed");
            const started = Date.now();
            const vector = await embedQuery("sunset over the ocean");
            setModelCheck(`${vector.length} dims, ${Date.now() - started} ms`);
          }}
        />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface },
  heading: {
    fontFamily: font.display,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.title,
    marginLeft: 4,
  },
  content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 40, gap: 20 },
  section: { gap: 6 },
  sectionTitle: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
    marginLeft: 12,
  },
  group: { backgroundColor: colors.raised, borderRadius: 14, overflow: "hidden" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  label: { color: colors.text, fontSize: 15 },
  value: { color: colors.muted, fontSize: 15, flexShrink: 1, textAlign: "right" },
  danger: { color: colors.danger },
  accent: { color: colors.accent },
});
