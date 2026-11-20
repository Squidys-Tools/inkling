import { useAtomValue } from "@effect/atom-react";
import { File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { useRoute } from "@react-navigation/native";
import { Linking, ScrollView, Share, StyleSheet, View } from "react-native";
import { CardTile } from "../cards/CardTile";
import { cardImage } from "../cards/cardImage";
import { cardTitle, hostname, savedAgo } from "../cards";
import { colors } from "../colors";
import { thumbnailSource, type PhoneCard } from "../desktop";
import { font } from "../fonts";
import type { Pairing } from "../pairing";
import type { ScreenProps } from "../routes";
import { pairingAtom } from "../state/library";
import { AppText } from "../ui/AppText";
import { Button } from "../ui/Button";
import { SymbolButton } from "../ui/SymbolButton";

const webUrl = (card: PhoneCard) => (card.sourceUrl?.startsWith("http") ? card.sourceUrl : null);

/** Shares the link when there is one, else the picture already on screen, else the text. */
async function share(pairing: Pairing | null | undefined, card: PhoneCard) {
  const url = webUrl(card);
  if (url) return Share.share({ url });
  if (pairing && card.hasThumbnail) {
    const path = await Image.getCachePathAsync(thumbnailSource(pairing, card).cacheKey);
    if (path) {
      // The cache file has a hashed name and no extension, so iOS wouldn't offer it as a picture.
      const named = new File(
        Paths.cache,
        `${
          cardTitle(card)
            .replace(/[^\w -]+/gu, "")
            .trim() || "inkling"
        }.webp`,
      );
      if (named.exists) named.delete();
      new File(path.startsWith("file://") ? path : `file://${path}`).copy(named);
      return Share.share({ url: named.uri });
    }
  }
  const text = card.post?.text ?? card.description;
  return Share.share({ message: [cardTitle(card), text].filter(Boolean).join("\n\n") });
}

function ShareButton() {
  const pairing = useAtomValue(pairingAtom);
  const { card } = useRoute<ScreenProps<"Item">["route"]>().params;
  return (
    <SymbolButton
      name="square.and.arrow.up"
      label="Share"
      onPress={() => void share(pairing, card)}
    />
  );
}

export const shareButton = () => <ShareButton />;

/** Pictures fill the stage at their own shape; files keep their card art; text kinds need none. */
function Hero({ pairing, card }: { pairing: Pairing; card: PhoneCard }) {
  const image = cardImage(pairing, card);
  const kind = card.displayKind;
  if (kind === "Note" || kind === "Quote" || kind === "Post") return null;
  if (kind === "Article")
    return image ? (
      <Image source={image} style={styles.cover} contentFit="cover" transition={180} />
    ) : null;
  if ((kind === "Image" || kind === "Video") && image)
    return (
      <View style={styles.stage}>
        <Image
          source={image}
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
  const pairing = useAtomValue(pairingAtom);
  const { card } = route.params;
  const kind = card.displayKind;
  const url = webUrl(card);
  const site = card.source ?? (url ? hostname(url) : "");
  const byline = card.post ? `${card.post.name} · @${card.post.handle} · ` : "";
  const text = card.post?.text || card.description;
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {pairing ? <Hero pairing={pairing} card={card} /> : null}
      <View style={styles.details}>
        <AppText variant="micro" style={styles.kind}>
          {site ? `${kind.toUpperCase()} · ${site.toUpperCase()}` : kind.toUpperCase()}
        </AppText>
        <AppText style={styles.title}>{cardTitle(card)}</AppText>
        <AppText variant="caption" style={styles.meta}>
          {`${byline}Saved ${savedAgo(card.createdAt)}`}
        </AppText>
        {text ? <AppText style={styles.body}>{text}</AppText> : null}
        {url ? (
          <View style={styles.open}>
            <Button
              label={`Open ${site}`}
              icon="arrow.up.right"
              fullWidth
              onPress={() => void Linking.openURL(url)}
            />
          </View>
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
  kind: { fontFamily: font.mono, letterSpacing: 1.4, color: colors.muted },
  title: {
    fontFamily: font.display,
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.6,
    color: colors.title,
  },
  meta: { fontFamily: font.mono, color: colors.muted },
  body: { fontSize: 17, lineHeight: 26, marginTop: 8 },
  open: { marginTop: 18 },
});
