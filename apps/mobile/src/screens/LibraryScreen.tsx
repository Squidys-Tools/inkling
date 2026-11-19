import { Button, FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { hostname, cardTitle } from "../cards";
import { colors } from "../colors";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";
import { EmptyState } from "../ui/EmptyState";
import { StatusPill } from "../ui/StatusPill";
import { Thumbnail, tileStyles } from "../ui/Thumbnail";

function Banner({ connection, onPair }: { connection: string; onPair: () => void }) {
  if (connection === "repair")
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          This desktop's token changed. Pair again to keep browsing.
        </Text>
        <Button title="Pair again" onPress={onPair} />
      </View>
    );
  if (connection === "offline")
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Can't reach your desktop. Your saves wait on this phone until it's back.
        </Text>
      </View>
    );
  return null;
}

export function LibraryScreen({ navigation }: ScreenProps<"Library">) {
  const library = useLibrary();
  const { pairing } = library;
  if (pairing === undefined) return null;
  if (library.tailscale.authURL)
    return (
      <EmptyState
        title="Sign in to Tailscale"
        detail="inkling reaches your desktop over your own tailnet. Sign in once on this phone."
        actionLabel="Sign in"
        onAction={() => Linking.openURL(library.tailscale.authURL ?? "")}
      />
    );
  if (!pairing)
    return (
      <EmptyState
        title="Pair with your desktop"
        detail="Turn on the phone service in inkling on your desktop, then open its pairing link here or enter its address and token."
        actionLabel="Pair"
        onAction={() => navigation.navigate("Pair")}
      />
    );

  const rows = [
    ...library.pending.map((entry) => ({ key: `pending-${entry.id}`, entry })),
    ...library.cards.map((card) => ({ key: card.id, card })),
  ];
  const searching = library.shownQuery.trim() !== "";
  return (
    <FlatList
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.grid}
      data={rows}
      keyExtractor={(row) => row.key}
      numColumns={3}
      refreshing={false}
      onRefresh={() => library.refresh(library.query)}
      initialNumToRender={18}
      windowSize={5}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <StatusPill connection={library.connection} />
            {library.notice ? <Text style={styles.notice}>{library.notice}</Text> : null}
          </View>
          <Banner connection={library.connection} onPair={() => navigation.navigate("Pair")} />
        </View>
      }
      ListEmptyComponent={
        library.connection === "connected" ? (
          <EmptyState
            title={searching ? "Nothing matches" : "Nothing saved yet"}
            detail={
              searching
                ? `No saves match "${library.shownQuery}". Try describing what you remember.`
                : "Share a link or photo to inkling and it shows up here."
            }
          />
        ) : undefined
      }
      renderItem={({ item: row }) =>
        "entry" in row ? (
          <View style={styles.cell}>
            <View style={[styles.tile, tileStyles.placeholder]}>
              <Text style={tileStyles.text} numberOfLines={5}>
                {row.entry.kind === "url" ? hostname(row.entry.text) : row.entry.text}
              </Text>
            </View>
            <Text style={styles.waiting}>Waiting for desktop</Text>
          </View>
        ) : (
          <Pressable
            style={styles.cell}
            onPress={() => navigation.navigate("Item", { card: row.card })}
          >
            <Thumbnail pairing={pairing} card={row.card} />
            <Text style={styles.cardTitle} numberOfLines={2}>
              {cardTitle(row.card)}
            </Text>
          </Pressable>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  grid: { paddingHorizontal: 8, paddingBottom: 24 },
  header: { paddingHorizontal: 4, paddingBottom: 8, gap: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  notice: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  banner: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 4 },
  bannerText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  cell: { flex: 1 / 3, padding: 4 },
  tile: { width: "100%", aspectRatio: 1, borderRadius: 10 },
  cardTitle: { color: colors.text, fontSize: 12, marginTop: 6 },
  waiting: { color: colors.warning, fontSize: 11, marginTop: 6 },
});
