import { useAtomValue } from "@effect/atom-react";
import { type DrawerContentComponentProps, useDrawerStatus } from "@react-navigation/drawer";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { SymbolView, type SFSymbol } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spaceColors } from "../colors";
import type { Scope } from "../desktop";
import { font } from "../fonts";
import { AsyncResult } from "effect/reactivity";
import { selectScope } from "../state/actions";
import { useRegistry } from "../state/hooks";
import { scopeAtom, spacesAtom, totalAtom } from "../state/library";
import { Mascot } from "./Mascot";

function Row(props: {
  icon: ReactNode;
  label: string;
  count?: number | null;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.active }}
      onPress={props.onPress}
      style={[styles.row, props.active && styles.active]}
    >
      <View style={styles.icon}>{props.icon}</View>
      <Text style={[styles.label, props.active && styles.activeLabel]} numberOfLines={1}>
        {props.label}
      </Text>
      {props.count != null ? <Text style={styles.count}>{props.count}</Text> : null}
    </Pressable>
  );
}

const glass = isLiquidGlassAvailable();

const symbol = (name: SFSymbol) => <SymbolView name={name} tintColor={colors.inkSoft} size={18} />;

/** Desktop's sidebar for the phone: Everything, the Spaces, Archive, and Settings at the foot. */
export function Sidebar({ navigation }: DrawerContentComponentProps) {
  const registry = useRegistry();
  const scope = useAtomValue(scopeAtom);
  const total = useAtomValue(totalAtom);
  const spaces = AsyncResult.getOrElse(useAtomValue(spacesAtom), () => null) ?? [];
  const insets = useSafeAreaInsets();
  const pick = (next: Scope) => {
    selectScope(registry, next);
    navigation.navigate("Main", { screen: "Library" });
    navigation.closeDrawer();
  };
  return (
    <View
      style={[styles.sidebar, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 8 }]}
    >
      <View style={styles.brand}>
        <Mascot size={40} visible={useDrawerStatus() === "open"} />
        <Text style={styles.wordmark}>inkling</Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Row
          icon={symbol("square.grid.3x3")}
          label="Everything"
          count={total}
          active={scope.kind === "everything"}
          onPress={() => pick({ kind: "everything" })}
        />
        <Text style={styles.section}>SPACES</Text>
        {spaces.map((space) => (
          <Row
            key={space.id}
            icon={
              <View
                style={[
                  styles.swatch,
                  { borderColor: spaceColors[space.color] },
                  space.kind === "regular" && { backgroundColor: spaceColors[space.color] },
                ]}
              />
            }
            label={space.name}
            count={space.itemCount}
            active={scope.kind === "space" && scope.space.id === space.id}
            onPress={() => pick({ kind: "space", space })}
          />
        ))}
        {spaces.length === 0 ? (
          <Text style={styles.empty}>Spaces you make on desktop show up here.</Text>
        ) : null}
        <View style={styles.rule} />
        <Row
          icon={symbol("archivebox")}
          label="Archive"
          active={scope.kind === "archived"}
          onPress={() => pick({ kind: "archived" })}
        />
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={10}
          onPress={() => {
            navigation.closeDrawer();
            navigation.navigate("Main", { screen: "Settings" });
          }}
        >
          <GlassView
            isInteractive
            glassEffectStyle="regular"
            style={[styles.settings, !glass && styles.settingsFallback]}
          >
            <SymbolView name="gearshape" tintColor={colors.inkSoft} size={20} />
            <Text style={styles.footerLabel}>Settings</Text>
          </GlassView>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 6,
    marginBottom: 18,
  },
  sidebar: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 14 },
  wordmark: {
    fontFamily: font.display,
    fontSize: 28,
    letterSpacing: -0.8,
    color: colors.title,
    paddingRight: 8,
  },
  list: { flex: 1 },
  listContent: { gap: 2, paddingBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 12,
  },
  active: { backgroundColor: colors.raised },
  icon: { width: 22, alignItems: "center" },
  label: { flex: 1, color: colors.inkSoft, fontSize: 17 },
  activeLabel: { color: colors.title, fontWeight: "600" },
  count: { fontFamily: font.mono, fontSize: 12, color: colors.muted },
  section: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.muted,
    paddingHorizontal: 10,
    marginTop: 18,
    marginBottom: 6,
  },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5 },
  empty: { color: colors.faint, fontSize: 13, paddingHorizontal: 10, paddingVertical: 6 },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 10,
    marginVertical: 12,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  footerLabel: { color: colors.inkSoft, fontSize: 16 },
  settings: {
    flexDirection: "row",
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsFallback: { backgroundColor: colors.raised },
});
