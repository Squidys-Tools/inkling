import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles } from "../appearance";
import { cardTitle, fileExtension, hostname, kindOf, quoteAttribution } from "../cards";
import type { Palette } from "../colors";
import type { PhoneCard } from "../desktop";

export function FieldnotesCard({ card, image }: { card: PhoneCard; image: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const kind = kindOf(card);
  const quote = kind === "Quote";
  const note = kind === "Note";
  const source = card.source ?? (card.sourceUrl ? hostname(card.sourceUrl) : "");
  const excerpt = quote
    ? cardTitle(card)
    : note
      ? card.description || cardTitle(card)
      : cardTitle(card);
  return (
    <View>
      <Text style={styles.kind}>
        {kind === "File" ? fileExtension(card.title) || "FILE" : kind.toUpperCase()}
      </Text>
      {image && !quote && !note ? (
        <Image
          source={{ uri: image }}
          style={[
            styles.image,
            { aspectRatio: Math.min(1.6, Math.max(0.7, card.aspectRatio ?? 1)) },
          ]}
          contentFit="cover"
          transition={180}
        />
      ) : (
        <View style={[styles.paper, quote && styles.quotePaper]}>
          {quote ? <Text style={styles.quoteMark}>“</Text> : null}
          <Text style={[styles.excerpt, quote && styles.quoteText]} numberOfLines={quote ? 7 : 5}>
            {kind === "Post" ? card.post?.text || excerpt : excerpt}
          </Text>
          {quote && card.description ? (
            <Text style={styles.attribution} numberOfLines={2}>
              {quoteAttribution(card.description)}
            </Text>
          ) : null}
          {!quote && !note ? (
            <Text style={styles.documentMark}>
              {kind === "PDF"
                ? "PDF / DOCUMENT"
                : kind === "Post"
                  ? "𝕏 / SAVED POST"
                  : kind === "Video"
                    ? "▶ / VIDEO"
                    : "↗"}
            </Text>
          ) : null}
        </View>
      )}
      {!quote ? (
        <Text style={styles.title} numberOfLines={2}>
          {cardTitle(card)}
        </Text>
      ) : null}
      {source ? (
        <Text style={styles.source} numberOfLines={1}>
          {source}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    kind: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 1.4,
      marginBottom: 8,
    },
    image: {
      width: "100%",
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.raised,
    },
    paper: {
      minHeight: 176,
      padding: 16,
      justifyContent: "center",
      backgroundColor: colors.placeholderSurface,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: 14,
    },
    quotePaper: { backgroundColor: colors.surface, paddingTop: 10 },
    quoteMark: {
      fontFamily: "Georgia",
      fontSize: 52,
      lineHeight: 52,
      color: colors.accent,
      marginBottom: -20,
    },
    excerpt: { fontFamily: "Georgia", fontSize: 17, lineHeight: 25, color: colors.title },
    quoteText: { fontStyle: "italic" },
    attribution: { color: colors.muted, fontSize: 11, lineHeight: 16 },
    documentMark: { color: colors.accent, fontSize: 10, letterSpacing: 1.2 },
    title: {
      fontFamily: "Georgia",
      fontSize: 16,
      lineHeight: 21,
      marginTop: 10,
      color: colors.title,
    },
    source: { color: colors.muted, fontSize: 11, marginTop: 5 },
  });
