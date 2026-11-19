import { Image } from "expo-image";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CardTile } from "../cards/CardTile";
import { useCardImage } from "../cards/useCardImage";
import { cardTitle, hostname, kindOf, savedAgo } from "../cards";
import { colors } from "../colors";
import type { PhoneCard } from "../desktop";
import { font } from "../fonts";
import type { Pairing } from "../pairing";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";

/** Pictures fill the stage at their own shape; text kinds keep their card art. */
function Hero({ pairing, card }: { pairing: Pairing; card: PhoneCard }) {
  const image = useCardImage(pairing, card);
  const kind = kindOf(card);
  if (kind === "Article")
    return image ? (
      <Image source={{ uri: image }} style={styles.cover} contentFit="cover" transition={180} />
    ) : null;
  if ((kind === "Image" || kind === "Video") && image)
    return (
      <View style={styles.stage}>
        <Image
          source={{ uri: image }}
          style={[styles.picture, { aspectRatio: Math.max(0.5, card.aspectRatio ?? 1) }]}
          contentFit="contain"
          transition={180}
        />
      </View>
    );
  return (
    <View style={styles.stage}>
      <View style={styles.art}>
        <CardTile pairing={pairing} card={card} />
      </View>
    </View>
  );
}

export function ItemScreen({ route }: ScreenProps<"Item">) {
  const { pairing } = useLibrary();
  const { card } = route.params;
  const kind = kindOf(card);
  const site = card.source ?? (card.sourceUrl?.startsWith("http") ? hostname(card.sourceUrl) : "");
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {pairing ? <Hero pairing={pairing} card={card} /> : null}
      <View style={styles.details}>
        <Text style={styles.kind}>
          {site ? `${kind.toUpperCase()} · ${site.toUpperCase()}` : kind.toUpperCase()}
        </Text>
        <Text style={styles.title}>{cardTitle(card)}</Text>
        <Text style={styles.meta}>{`Saved ${savedAgo(card.createdAt)}`}</Text>
        {card.description ? <Text style={styles.body}>{card.description}</Text> : null}
        {card.sourceUrl?.startsWith("http") ? (
          <Pressable
            accessibilityRole="link"
            style={styles.open}
            onPress={() => Linking.openURL(card.sourceUrl ?? "")}
          >
            <Text style={styles.openText}>{`Open ${site} ↗`}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  stage: {
    backgroundColor: colors.stage,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.raised },
  picture: { width: "100%", maxHeight: 460, borderRadius: 12 },
  art: { width: "72%" },
  details: { paddingHorizontal: 20, paddingTop: 22, gap: 8 },
  kind: { fontFamily: font.mono, fontSize: 10, letterSpacing: 1.4, color: colors.muted },
  title: {
    fontFamily: font.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.title,
  },
  meta: { fontFamily: font.mono, fontSize: 11, color: colors.muted },
  body: { color: colors.text, fontSize: 16, lineHeight: 24, marginTop: 8 },
  open: {
    alignSelf: "flex-start",
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  openText: { color: colors.text, fontSize: 14, fontWeight: "500" },
});
