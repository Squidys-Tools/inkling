import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { payloadUri, type OutboxEntry } from "../outbox";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Notice } from "../ui/Notice";

function Banner({ connection, onPair }: { connection: Connection; onPair: () => void }) {
  if (connection === "repair")
    return (
      <Notice
        icon="exclamationmark.triangle"
        tone="danger"
        message="This desktop's token changed. Pair again to keep browsing."
        action={<Button tone="primary" label="Pair again" onPress={onPair} />}
      />
    );
  if (connection === "offline")
    return (
      <Notice
        icon="wifi.slash"
        message="Can't reach your desktop. Check that Tailscale is on here and on the desktop. Your saves wait on this phone until it's back."
      />
    );
  return null;
}

/** A share still on this phone: its own photo when it has one, else the typed card. */
function PendingCard({ entry, refused }: { entry: OutboxEntry; refused: boolean }) {
  const footnote = refused ? "DESKTOP COULDN'T SAVE THIS" : "WAITING FOR DESKTOP";
  const uri = entry.kind === "image" ? payloadUri(entry) : null;
  if (uri)
    return (
      <View style={styles.pendingImage}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <Text style={styles.pendingBadge}>{footnote}</Text>
      </View>
    );
  return (
    <TypedArt
      label="ON THIS PHONE"
      title={entry.kind === "url" ? hostname(entry.text) : entry.text}
      footnote={footnote}
    />
  );
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
  const pairPrompt = (
    <EmptyState
      title="Pair with your desktop"
      detail={
        outbox.length
          ? "These saves wait on this phone until it's paired with your desktop."
          : "Turn on the phone service in inkling on your desktop, keep Tailscale on here, then open the pairing link it shows."
      }
      actionLabel="Pair"
      onAction={() => navigation.navigate("Pair")}
    />
  );
  // Saves shared before pairing still show, under the prompt that sends them.
  if (!pairing && outbox.length === 0) return <Inset>{pairPrompt}</Inset>;

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
          {pairing ? null : pairPrompt}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {search && view.cards.length > 0 ? (
            // iOS hides the header title while the search bar is active, so results name their query.
            <Text style={styles.notice}>
              {`${view.cards.length}${view.more ? "+" : ""} for “${search}”`}
            </Text>
          ) : null}
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
            <PendingCard entry={row.entry} refused={refused.has(row.entry.id)} />
          </View>
        ) : (
          <Pressable
            style={styles.cell}
            accessibilityLabel={cardTitle(row.card)}
            onPress={() => navigation.navigate("Item", { card: row.card })}
          >
            {pairing ? <CardTile pairing={pairing} card={row.card} /> : null}
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
  pendingImage: {
    aspectRatio: 4 / 3,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.raised,
    justifyContent: "flex-end",
    padding: 10,
  },
  pendingBadge: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.tileButton,
    color: colors.text,
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  cell: { padding: 5 },
  loading: { paddingVertical: 32 },
});
