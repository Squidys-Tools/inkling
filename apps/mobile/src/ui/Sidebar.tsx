import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { SymbolView } from "expo-symbols";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spaceColors, spaceTints } from "../colors";
import type { Scope, Space } from "../desktop";
import { font } from "../fonts";
import { useLibrary } from "../state";

function PlainRow(props: {
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
      <Text style={[styles.plain, props.active && styles.plainActive]} numberOfLines={1}>
        {props.label}
      </Text>
      {props.count != null ? <Text style={styles.count}>{props.count}</Text> : null}
    </Pressable>
  );
}

function SpaceRow(props: { space: Space; active: boolean; onPress: () => void }) {
  const { space } = props;
  const ink = spaceColors[space.color];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={space.name}
      accessibilityState={{ selected: props.active }}
      onPress={props.onPress}
      style={[
        styles.row,
        styles.space,
        { borderColor: ink, backgroundColor: spaceTints[space.color] },
        props.active && styles.spaceActive,
      ]}
    >
      <SymbolView name="chevron.right" tintColor={ink} size={11} weight="semibold" />
      <Text style={[styles.spaceLabel, { color: ink }]} numberOfLines={1}>
        {space.name}
      </Text>
      {space.itemCount != null ? <Text style={styles.count}>{space.itemCount}</Text> : null}
    </Pressable>
  );
}

/** Desktop's sidebar for the phone: Spaces as tinted rows, then Everything and Archive. */
export function Sidebar({ navigation }: DrawerContentComponentProps) {
  const library = useLibrary();
  const insets = useSafeAreaInsets();
  const { scope } = library;
  const pick = (next: Scope) => {
    library.selectScope(next);
    navigation.navigate("Main", { screen: "Library" });
    navigation.closeDrawer();
  };
  return (
    <View
      style={[styles.sidebar, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 6 }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        {library.total != null ? <Text style={styles.count}>{library.total}</Text> : null}
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {library.spaces.map((space) => (
          <SpaceRow
            key={space.id}
            space={space}
            active={scope.kind === "space" && scope.space.id === space.id}
            onPress={() => pick({ kind: "space", space })}
          />
        ))}
        <PlainRow
          label="Everything"
          count={library.total}
          active={scope.kind === "everything"}
          onPress={() => pick({ kind: "everything" })}
        />
        <PlainRow
          label="Archive"
          active={scope.kind === "archived"}
          onPress={() => pick({ kind: "archived" })}
        />
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        style={styles.footer}
        onPress={() => {
          navigation.closeDrawer();
          navigation.navigate("Main", { screen: "Settings" });
        }}
      >
        <SymbolView name="gearshape" tintColor={colors.muted} size={20} />
        <Text style={styles.footerLabel}>Settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  title: { color: colors.inkSoft, fontSize: 17, fontWeight: "600" },
  list: { flex: 1 },
  listContent: { gap: 6, paddingBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  active: { backgroundColor: colors.raised },
  plain: { flex: 1, color: colors.muted, fontSize: 17 },
  plainActive: { color: colors.title },
  space: { borderWidth: 1 },
  spaceActive: { borderWidth: 2 },
  spaceLabel: { flex: 1, fontSize: 17, fontWeight: "600" },
  count: { fontFamily: font.mono, fontSize: 12, color: colors.muted },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footerLabel: { color: colors.muted, fontSize: 16 },
});
