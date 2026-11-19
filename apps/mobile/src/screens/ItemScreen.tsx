import { Linking, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { cardTitle, hostname, savedAgo } from "../cards";
import { useAppearance, useThemedStyles } from "../appearance";
import type { Palette } from "../colors";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";
import { Thumbnail } from "../ui/Thumbnail";

export function ItemScreen({ route }: ScreenProps<"Item">) {
  const styles = useThemedStyles(makeStyles);
  const { look } = useAppearance();
  const fieldnotes = look === "fieldnotes";
  const { pairing } = useLibrary();
  const { card } = route.params;
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, fieldnotes && styles.paperContent]}
    >
      {fieldnotes ? (
        <Text style={styles.eyebrow}>{card.kind.toUpperCase()} / KEPT IN INKLING</Text>
      ) : null}
      {pairing && (!fieldnotes || card.hasThumbnail) ? (
        <Thumbnail pairing={pairing} card={card} fit="contain" style={styles.hero} />
      ) : null}
      <Text style={[styles.title, fieldnotes && styles.paperTitle]}>{cardTitle(card)}</Text>
      <Text
        style={[styles.meta, fieldnotes && styles.paperMeta]}
      >{`Saved ${savedAgo(card.createdAt)}`}</Text>
      {card.description ? (
        <Text style={[styles.body, fieldnotes && styles.paperBody]}>{card.description}</Text>
      ) : null}
      {card.sourceUrl ? (
        <Pressable
          accessibilityRole="link"
          style={fieldnotes && styles.paperLink}
          onPress={() => Linking.openURL(card.sourceUrl ?? "")}
        >
          <Text
            style={styles.link}
          >{`Open ${hostname(card.sourceUrl)}${fieldnotes ? " ↗" : ""}`}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { backgroundColor: colors.background },
    content: { padding: 16, gap: 10 },
    hero: { aspectRatio: 4 / 3, backgroundColor: colors.surface },
    title: { color: colors.title, fontSize: 22, fontWeight: "600", marginTop: 6 },
    meta: { color: colors.muted, fontSize: 13 },
    body: { color: colors.text, fontSize: 15, lineHeight: 22 },
    link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
    paperContent: { padding: 24, gap: 18, paddingBottom: 48 },
    eyebrow: {
      color: colors.muted,
      fontSize: 10,
      letterSpacing: 1.8,
      fontWeight: "600",
      marginBottom: 4,
    },
    paperTitle: {
      fontFamily: "Georgia",
      fontSize: 32,
      lineHeight: 39,
      fontWeight: "400",
      letterSpacing: -0.6,
    },
    paperMeta: {
      paddingBottom: 20,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    paperBody: { fontFamily: "Georgia", fontSize: 19, lineHeight: 30 },
    paperLink: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingVertical: 18,
      marginTop: 8,
      minHeight: 48,
    },
  });
