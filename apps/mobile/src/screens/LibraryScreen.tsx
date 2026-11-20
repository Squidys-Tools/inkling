import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { FlashList } from "@shopify/flash-list";
import { useState } from "react";
import {
  ActivityIndicator,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { TypedArt, CardTile } from "../cards/CardTile";
import { cardTitle, hostname } from "../cards";
import { colors } from "../colors";
import { font } from "../fonts";
import type { ScreenProps } from "../routes";
import { outboxAtom, refreshLibrary, refusedAtom } from "../state/actions";
import { useRegistry } from "../state/hooks";
import {
  cardsAtom,
  cardsView,
  connectionAtom,
  noticeAtom,
  pairingAtom,
  searchAtom,
  type Connection,
} from "../state/library";
import { EmptyState } from "../ui/EmptyState";

function Banner({ connection, onPair }: { connection: Connection; onPair: () => void }) {
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
          Can't reach your desktop. Check that Tailscale is on here and on the desktop. Your saves
          wait on this phone until it's back.
        </Text>
      </View>
    );
  return null;
}

// The header floats over the screen; an inset scroll view keeps content below it.
const Inset = ({ children }: { children: React.ReactNode }) => (
  <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic">
    {children}
  </ScrollView>
);

export function LibraryScreen({ navigation }: ScreenProps<"Library">) {
  const registry = useRegistry();
  const pairing = useAtomValue(pairingAtom);
  const connection = useAtomValue(connectionAtom);
  const view = cardsView(useAtomValue(cardsAtom));
  const loadMore = useAtomSet(cardsAtom);
  const outbox = useAtomValue(outboxAtom);
  const refused = useAtomValue(refusedAtom);
  const notice = useAtomValue(noticeAtom);
  const search = useAtomValue(searchAtom);
  // Shows the pull spinner until the reload it started settles, not during later page loads.
  const [pulled, setPulled] = useState(false);
  if (pulled && !view.loading) setPulled(false);
  if (connection === "loading") return null;
  if (!pairing)
    return (
      <Inset>
        <EmptyState
          title="Pair with your desktop"
          detail="Turn on the phone service in inkling on your desktop, keep Tailscale on here, then open the pairing link it shows."
          actionLabel="Pair"
          onAction={() => navigation.navigate("Pair")}
        />
      </Inset>
    );

  const rows = [
    ...outbox.map((entry) => ({ key: `pending-${entry.id}`, entry })),
    ...view.cards.map((card) => ({ key: card.id, card })),
  ];
  return (
    <FlashList
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.grid}
      data={rows}
      masonry
      numColumns={2}
      keyExtractor={(row) => row.key}
      getItemType={(row) => ("entry" in row ? "pending" : row.card.displayKind)}
      refreshing={pulled}
      onRefresh={() => {
        setPulled(true);
        void refreshLibrary(registry);
      }}
      onEndReached={() => {
        if (view.more && !view.loading) loadMore();
      }}
      ListHeaderComponent={
        <View style={styles.header}>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Banner connection={connection} onPair={() => navigation.navigate("Pair")} />
        </View>
      }
      ListEmptyComponent={
        view.loading ? (
          <ActivityIndicator style={styles.loading} color={colors.muted} />
        ) : connection === "connected" && !view.failed ? (
          <EmptyState
            title={search ? "Nothing matches" : "Nothing saved yet"}
            detail={
              search
                ? `No saves match "${search}". Try describing what you remember.`
                : "Share a link or photo to inkling and it shows up here."
            }
          />
        ) : undefined
      }
      ListFooterComponent={
        view.more && view.cards.length > 0 ? (
          <ActivityIndicator style={styles.loading} color={colors.muted} />
        ) : null
      }
      renderItem={({ item: row }) =>
        "entry" in row ? (
          <View style={styles.cell}>
            <TypedArt
              label="ON THIS PHONE"
              title={row.entry.kind === "url" ? hostname(row.entry.text) : row.entry.text}
              footnote={
                refused.has(row.entry.id) ? "DESKTOP COULDN'T SAVE THIS" : "WAITING FOR DESKTOP"
              }
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
  // Room for the floating search bar, so the last cards scroll clear of it.
  grid: { paddingHorizontal: 10, paddingBottom: 120 },
  header: { paddingHorizontal: 4, paddingBottom: 10, gap: 8 },
  notice: { color: colors.muted, fontFamily: font.mono, fontSize: 11, flexShrink: 1 },
  banner: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 4 },
  bannerText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  cell: { padding: 5 },
  loading: { paddingVertical: 32 },
});
