import { FlashList } from "@shopify/flash-list";
import { Button, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { TypedArt, CardTile } from "../cards/CardTile";
import { cardTitle, hostname } from "../cards";
import { colors } from "../colors";
import { font } from "../fonts";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";
import { EmptyState } from "../ui/EmptyState";
import { StatusPill } from "../ui/StatusPill";

function Banner({ connection, onPair }: { connection: string; onPair: () => void }) {
  if (connection === "repair")
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          This desktop's token changed. Pair again to keep browsing.
        </Text>
        <Button title="Pair again" color={colors.accent} onPress={onPair} />
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

// The large title header floats over the screen; an inset scroll view keeps content below it.
const Inset = ({ children }: { children: React.ReactNode }) => (
  <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic">
    {children}
  </ScrollView>
);

export function LibraryScreen({ navigation }: ScreenProps<"Library">) {
  const library = useLibrary();
  const { pairing } = library;
  if (pairing === undefined) return null;
  if (library.tailscale.authURL)
    return (
      <Inset>
        <EmptyState
          title="Sign in to Tailscale"
          detail="inkling reaches your desktop over your own tailnet. Sign in once on this phone."
          actionLabel="Sign in"
          onAction={() => Linking.openURL(library.tailscale.authURL ?? "")}
        />
      </Inset>
    );
  if (!pairing)
    return (
      <Inset>
        <EmptyState
          title="Pair with your desktop"
          detail="Turn on the phone service in inkling on your desktop, then open its pairing link here or enter its address and token."
          actionLabel="Pair"
          onAction={() => navigation.navigate("Pair")}
        />
      </Inset>
    );

  const rows = [
    ...library.pending.map((entry) => ({ key: `pending-${entry.id}`, entry })),
    ...library.cards.map((card) => ({ key: card.id, card })),
  ];
  const searching = library.shownQuery.trim() !== "";
  return (
    <FlashList
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.grid}
      data={rows}
      masonry
      numColumns={2}
      keyExtractor={(row) => row.key}
      refreshing={false}
      onRefresh={() => library.refresh(library.query)}
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
            <TypedArt
              label="ON THIS PHONE"
              title={row.entry.kind === "url" ? hostname(row.entry.text) : row.entry.text}
              footnote="WAITING FOR DESKTOP"
            />
          </View>
        ) : (
          <Pressable
            style={styles.cell}
            accessibilityLabel={cardTitle(row.card)}
            onPress={() => navigation.navigate("Item", { card: row.card })}
          >
            <CardTile pairing={pairing} card={row.card} />
          </Pressable>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  grid: { paddingHorizontal: 10, paddingBottom: 24 },
  header: { paddingHorizontal: 4, paddingBottom: 10, gap: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  notice: { color: colors.muted, fontFamily: font.mono, fontSize: 11, flexShrink: 1 },
  banner: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 4 },
  bannerText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  cell: { padding: 5 },
});
