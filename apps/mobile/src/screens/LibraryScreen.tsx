import { FlashList } from "@shopify/flash-list";
import { Button, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { hostname, cardTitle } from "../cards";
import { useAppearance, useThemedStyles } from "../appearance";
import type { Palette } from "../colors";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";
import { EmptyState } from "../ui/EmptyState";
import { StatusPill } from "../ui/StatusPill";
import { CardTile, TypedArt } from "../cards/CardTile";

function Banner({ connection, onPair }: { connection: string; onPair: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useAppearance();
  if (connection === "repair")
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          This desktop's token changed. Pair again to keep browsing.
        </Text>
        <Button title="Pair again" onPress={onPair} color={colors.accent} />
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
const Inset = ({ children }: { children: React.ReactNode }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  );
};

export function LibraryScreen({ navigation }: ScreenProps<"Library">) {
  const styles = useThemedStyles(makeStyles);
  const { look } = useAppearance();
  const fieldnotes = look === "fieldnotes";
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
      key={look}
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.grid, fieldnotes && styles.paperGrid]}
      data={rows}
      masonry
      numColumns={2}
      keyExtractor={(row) => row.key}
      refreshing={false}
      onRefresh={() => library.refresh(library.query)}
      ListHeaderComponent={
        <View style={styles.header}>
          {fieldnotes ? (
            <View style={styles.collectionHeading}>
              <Text style={styles.eyebrow}>
                {searching ? "FOUND IN YOUR COLLECTION" : "YOUR PRIVATE COLLECTION"}
              </Text>
              <View style={styles.collectionRow}>
                <Text style={styles.collectionTitle}>
                  {searching ? "Found things." : "Kept things."}
                </Text>
                <Text style={styles.count}>{String(library.cards.length).padStart(2, "0")}</Text>
              </View>
            </View>
          ) : null}
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
          <View style={[styles.cell, fieldnotes && styles.paperCell]}>
            <TypedArt
              label="ON THIS PHONE"
              title={row.entry.kind === "url" ? hostname(row.entry.text) : row.entry.text}
              footnote="WAITING FOR DESKTOP"
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cardTitle(row.card)}
            style={({ pressed }) => [
              styles.cell,
              fieldnotes && styles.paperCell,
              pressed && styles.pressed,
            ]}
            onPress={() => navigation.navigate("Item", { card: row.card })}
          >
            <CardTile pairing={pairing} card={row.card} />
          </Pressable>
        )
      }
    />
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { backgroundColor: colors.background },
    grid: { paddingHorizontal: 10, paddingBottom: 24 },
    header: { paddingHorizontal: 4, paddingBottom: 8, gap: 8 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    notice: { color: colors.muted, fontSize: 12, flexShrink: 1 },
    banner: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 4 },
    bannerText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    cell: { padding: 5 },
    paperGrid: { paddingHorizontal: 18, paddingBottom: 40 },
    paperCell: { paddingHorizontal: 7, paddingBottom: 24 },
    collectionHeading: {
      gap: 12,
      paddingTop: 24,
      paddingBottom: 16,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      marginBottom: 8,
    },
    eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "600", letterSpacing: 2 },
    collectionRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 8,
    },
    collectionTitle: {
      color: colors.title,
      fontFamily: "Georgia",
      fontSize: 34,
      letterSpacing: -1,
      flexShrink: 1,
    },
    count: { color: colors.accent, fontFamily: "Georgia", fontSize: 22, fontStyle: "italic" },
    pressed: { opacity: 0.65 },
  });
