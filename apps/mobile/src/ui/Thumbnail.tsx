import { Image, type ImageStyle } from "expo-image";
import { useEffect, useState } from "react";
import { type StyleProp, StyleSheet, Text, View } from "react-native";
import { hostname } from "../cards";
import { colors } from "../colors";
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
      <Image source={{ uri }} style={[styles.tile, style]} contentFit={fit} transition={180} />
    );
  return (
    <View style={[styles.tile, styles.placeholder, style]}>
      <Text style={styles.text} numberOfLines={5}>
        {card.kind === "note" || card.kind === "quote"
          ? card.description
          : card.sourceUrl
            ? hostname(card.sourceUrl)
            : "Processing…"}
      </Text>
    </View>
  );
}

export const tileStyles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.placeholderSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { color: colors.text, fontSize: 12, padding: 8, textAlign: "center" },
});

const styles = StyleSheet.create({
  tile: { width: "100%", aspectRatio: 1, borderRadius: 10, overflow: "hidden" },
  ...tileStyles,
});
