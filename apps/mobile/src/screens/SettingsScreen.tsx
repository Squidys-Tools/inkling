import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppearance, useThemedStyles } from "../appearance";
import type { Palette } from "../colors";
import { embedQuery, modelInstalled } from "../embedQuery";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
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
  const styles = useThemedStyles(makeStyles);
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
  const styles = useThemedStyles(makeStyles);
  const { look, setLook } = useAppearance();
  const library = useLibrary();
  const [modelCheck, setModelCheck] = useState("");
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Section title="Appearance">
        <View accessibilityRole="radiogroup" accessibilityLabel="Appearance">
          {(["inkling", "fieldnotes"] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: look === option }}
              accessibilityLabel={option === "fieldnotes" ? "Fieldnotes" : "Inkling"}
              onPress={() => setLook(option)}
              style={styles.row}
            >
              <View style={styles.lookText}>
                <Text style={styles.label}>
                  {option === "fieldnotes" ? "Fieldnotes" : "Inkling"}
                </Text>
                <Text style={styles.lookDetail}>
                  {option === "fieldnotes"
                    ? "Paper, ink & a little margin."
                    : "The original dark library."}
                </Text>
              </View>
              <Text style={styles.accent}>{look === option ? "✓" : "○"}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
      <Section title="Tailscale">
        <Row label="Status" value={library.tailscale.state} />
        <Row label="This phone" value={library.tailscale.ips?.[0] ?? "—"} />
      </Section>
      <Section title="Desktop">
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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { backgroundColor: colors.background },
    content: { padding: 16, gap: 20 },
    section: { gap: 6 },
    sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: "600", marginLeft: 12 },
    group: { backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden" },
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
    lookText: { flex: 1, gap: 4 },
    lookDetail: { color: colors.muted, fontSize: 13 },
  });
