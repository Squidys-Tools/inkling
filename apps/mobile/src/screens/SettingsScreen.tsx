import { SymbolView, type SFSymbol } from "expo-symbols";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../colors";
import { embedQuery, modelInstalled } from "../embedQuery";
import { font } from "../fonts";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";
import { StatusPill } from "../ui/StatusPill";

type Page = "home" | "desktop" | "tailscale" | "search";
const titles: Record<Page, string> = {
  home: "Settings",
  desktop: "Desktop",
  tailscale: "Tailscale",
  search: "On-device search",
};

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row(props: {
  icon?: SFSymbol;
  label: string;
  value?: string;
  tone?: "danger" | "accent";
  last?: boolean;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const ink =
    props.tone === "danger" ? colors.danger : props.tone === "accent" ? colors.accent : colors.text;
  const body = (
    <View style={styles.row}>
      {props.icon ? (
        <View style={styles.icon}>
          <SymbolView name={props.icon} tintColor={props.tone ? ink : colors.inkSoft} size={20} />
        </View>
      ) : null}
      <View style={[styles.rowBody, !props.last && styles.rule]}>
        <Text style={[styles.label, { color: ink }]}>{props.label}</Text>
        {props.value ? (
          <Text style={styles.value} numberOfLines={1}>
            {props.value}
          </Text>
        ) : null}
        {props.chevron ? (
          <SymbolView name="chevron.right" tintColor={colors.faint} size={14} />
        ) : null}
      </View>
    </View>
  );
  return props.onPress ? (
    <Pressable accessibilityRole="button" onPress={props.onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Settings as paged groups: a summary of this phone and its desktop, then a page per group. */
export function SettingsScreen({ navigation }: ScreenProps<"Settings">) {
  const library = useLibrary();
  const [page, setPage] = useState<Page>("home");
  const [modelCheck, setModelCheck] = useState("");
  const close = () => (page === "home" ? navigation.goBack() : setPage("home"));
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={page === "home" ? "Close" : "Back"}
          style={styles.round}
          onPress={close}
        >
          <SymbolView
            name={page === "home" ? "xmark" : "chevron.left"}
            tintColor={colors.text}
            size={17}
            weight="semibold"
          />
        </Pressable>
        <Text style={styles.title}>{titles[page]}</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {page === "home" ? (
          <>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <SymbolView name="desktopcomputer" tintColor={colors.title} size={22} />
              </View>
              <View style={styles.identityText}>
                <Text style={styles.identityName}>
                  {library.pairing ? "Paired desktop" : "No desktop yet"}
                </Text>
                <Text style={styles.identityDetail}>
                  {library.pairing?.address ?? "Pair to browse your library"}
                </Text>
              </View>
              <StatusPill connection={library.connection} />
            </View>
            <Group title="Library">
              <Row
                icon="desktopcomputer"
                label="Desktop"
                chevron
                onPress={() => setPage("desktop")}
              />
              <Row
                icon="point.3.connected.trianglepath.dotted"
                label="Tailscale"
                value={library.tailscale.state}
                chevron
                onPress={() => setPage("tailscale")}
              />
              <Row
                icon="sparkle.magnifyingglass"
                label="On-device search"
                chevron
                last
                onPress={() => setPage("search")}
              />
            </Group>
          </>
        ) : null}
        {page === "desktop" ? (
          <Group>
            <Row label="Address" value={library.pairing?.address ?? "Not paired"} />
            {library.pairing ? (
              <Row
                icon="xmark.circle"
                label="Forget this desktop"
                tone="danger"
                last
                onPress={() => library.forget().then(() => navigation.goBack())}
              />
            ) : (
              <Row
                icon="plus.circle"
                label="Pair with a desktop"
                tone="accent"
                last
                onPress={() => navigation.navigate("Pair")}
              />
            )}
          </Group>
        ) : null}
        {page === "tailscale" ? (
          <Group>
            <Row label="Status" value={library.tailscale.state} />
            <Row label="This phone" value={library.tailscale.ips?.[0] ?? "—"} last />
          </Group>
        ) : null}
        {page === "search" ? (
          <Group>
            <Row
              icon="checkmark.circle"
              label="Check the search model"
              tone="accent"
              value={modelCheck}
              last
              onPress={async () => {
                if (!modelInstalled()) return setModelCheck("Not installed");
                const started = Date.now();
                const vector = await embedQuery("sunset over the ocean");
                setModelCheck(`${vector.length} dims, ${Date.now() - started} ms`);
              }}
            />
          </Group>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: { width: 40 },
  title: { color: colors.title, fontSize: 17, fontWeight: "600" },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 22 },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.raised,
    borderRadius: 22,
    padding: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  identityText: { flex: 1, gap: 2 },
  identityName: { color: colors.title, fontSize: 17, fontWeight: "600" },
  identityDetail: { color: colors.muted, fontFamily: font.mono, fontSize: 12 },
  section: { gap: 8 },
  sectionTitle: { color: colors.muted, fontSize: 15, marginLeft: 16 },
  group: { backgroundColor: colors.raised, borderRadius: 22, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  icon: { width: 28, marginRight: 12, alignItems: "center" },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 15,
    paddingRight: 16,
  },
  rule: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { flex: 1, fontSize: 17 },
  value: { color: colors.muted, fontSize: 16, flexShrink: 1, textAlign: "right" },
});
