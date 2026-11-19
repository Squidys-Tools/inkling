import { Image, type ImageStyle } from "expo-image";
import { useEffect, useState } from "react";
import { type StyleProp, StyleSheet, Text, View } from "react-native";
import { hostname } from "../cards";
import { useAppearance, useThemedStyles } from "../appearance";
import type { Palette } from "../colors";
import { thumbnailUri, type PhoneCard } from "../desktop";
import type { Pairing } from "../pairing";

export function Thumbnail({
  pairing,
  card,
  style,
  fit = "cover",
}: {
  pairing: Pairing;
  card: PhoneCard;
  style?: StyleProp<ImageStyle>;
  fit?: "cover" | "contain";
}) {
  const styles = useThemedStyles(makeStyles);
  const { look } = useAppearance();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!card.hasThumbnail) return;
    let live = true;
    thumbnailUri(pairing, card.id).then(
      (next) => live && setUri(next),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [pairing, card.id, card.hasThumbnail]);
  if (uri)
    return (
      <Image
        source={{ uri }}
        style={[styles.tile, look === "fieldnotes" && styles.paperTile, style]}
        contentFit={fit}
        transition={180}
      />
    );
  return (
    <View
      style={[
        styles.tile,
        styles.placeholder,
        look === "fieldnotes" && styles.paperTile,
        look === "fieldnotes" && styles.paperContent,
        style,
      ]}
    >
      {look === "fieldnotes" && card.kind === "quote" ? (
        <Text style={styles.quoteMark}>“</Text>
      ) : null}
      <Text style={[styles.text, look === "fieldnotes" && styles.paperText]} numberOfLines={5}>
        {card.kind === "note" || card.kind === "quote"
          ? card.description
          : card.sourceUrl
            ? hostname(card.sourceUrl)
            : (card.title ?? card.kind)}
      </Text>
    </View>
  );
}

export const makeTileStyles = (colors: Palette) =>
  StyleSheet.create({
    placeholder: {
      backgroundColor: colors.placeholderSurface,
      alignItems: "center",
      justifyContent: "center",
    },
    text: { color: colors.text, fontSize: 12, padding: 8, textAlign: "center" },
  });

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    tile: { width: "100%", aspectRatio: 1, borderRadius: 10, overflow: "hidden" },
    ...makeTileStyles(colors),
    paperTile: {
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    paperContent: {
      alignItems: "flex-start",
      justifyContent: "center",
      paddingHorizontal: 8,
      backgroundColor: colors.placeholderSurface,
    },
    paperText: {
      fontFamily: "Georgia",
      fontSize: 17,
      lineHeight: 25,
      textAlign: "left",
      color: colors.title,
    },
    quoteMark: {
      fontFamily: "Georgia",
      fontSize: 48,
      lineHeight: 48,
      color: colors.accent,
      paddingLeft: 8,
      marginBottom: -12,
    },
  });
