import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, type TextProps, View } from "react-native";
import { fileExtension, hostname, quoteAttribution, wordCount } from "../cards";
import { colors } from "../colors";
import type { CardKind, PhoneCard } from "../desktop";
import { font } from "../fonts";
import type { Pairing } from "../pairing";
import { cardImage, type CardImage } from "./cardImage";

// Card text is drawn into fixed-shape artwork, like desktop's; past this it would clip.
const ArtText = (props: TextProps) => <Text maxFontSizeMultiplier={1.3} {...props} />;

const texture = require("../../assets/cards/typed-texture.png");

/** Notes, PDFs and files share desktop's typed layout: mono label and ring, caps title, three dots. */
export function TypedArt(props: { label: string; title: string; footnote?: string }) {
  return (
    <View style={styles.typed}>
      <Image source={texture} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.labelRow}>
        <ArtText style={styles.label}>{props.label}</ArtText>
        <View style={styles.ring} />
      </View>
      <ArtText style={styles.typedTitle} numberOfLines={3}>
        {props.title}
      </ArtText>
      <View style={styles.dots}>
        <View style={[styles.dot, { backgroundColor: colors.accentDeep }]} />
        <View style={[styles.dot, { backgroundColor: colors.paperYellow }]} />
        <View style={[styles.dot, { backgroundColor: colors.success }]} />
      </View>
      {props.footnote ? <ArtText style={styles.footnote}>{props.footnote}</ArtText> : null}
    </View>
  );
}

function ArticleCard({ card, image }: { card: PhoneCard; image: CardImage }) {
  const source = card.source ?? (card.sourceUrl ? hostname(card.sourceUrl) : "");
  return (
    <View style={styles.paper}>
      {image ? (
        <Image source={image} style={styles.strip} contentFit="cover" transition={180} />
      ) : null}
      <View style={styles.paperText}>
        <ArtText style={styles.paperTitle} numberOfLines={4}>
          {card.title ?? source}
        </ArtText>
        <View style={styles.paperFooter}>
          <ArtText style={styles.paperSource} numberOfLines={1}>
            {source}
          </ArtText>
          <ArtText style={styles.paperArrow}>↗</ArtText>
        </View>
      </View>
    </View>
  );
}

function QuoteCard({ card }: { card: PhoneCard }) {
  const attribution = quoteAttribution(card.description);
  return (
    <View style={styles.quote}>
      <ArtText style={styles.quoteMark}>“</ArtText>
      <ArtText style={styles.quoteText} numberOfLines={8}>
        {card.title?.replace(/\s+/gu, " ").trim() || "Saved quote"}
      </ArtText>
      {attribution ? (
        <>
          <View style={styles.quoteRule} />
          <ArtText style={styles.quoteBy} numberOfLines={1}>
            {attribution}
          </ArtText>
        </>
      ) : null}
    </View>
  );
}

function PostCard({ card }: { card: PhoneCard }) {
  const post = card.post;
  const name = post?.name || "X user";
  return (
    <View style={styles.post}>
      <View style={styles.postHead}>
        <View style={styles.avatar}>
          <ArtText style={styles.avatarInk}>{name.slice(0, 1).toUpperCase()}</ArtText>
        </View>
        <View style={styles.postWho}>
          <ArtText style={styles.postName} numberOfLines={1}>
            {name}
          </ArtText>
          <ArtText style={styles.postHandle} numberOfLines={1}>
            {post?.handle ? `@${post.handle}` : "@x"}
          </ArtText>
        </View>
        <ArtText style={styles.postMark}>𝕏</ArtText>
      </View>
      <ArtText style={styles.postText} numberOfLines={7}>
        {post?.text || card.description || card.title || "Post preview unavailable."}
      </ArtText>
    </View>
  );
}

// Desktop's fallbackRatio in apps/renderer/src/library/cardModel.ts, for media it couldn't measure.
const fallbackRatio = (kind: CardKind) => (kind === "Video" ? 16 / 9 : 4 / 3);

function MediaCard({ card, image }: { card: PhoneCard; image: NonNullable<CardImage> }) {
  const kind = card.displayKind;
  const ratio = Math.min(1.8, Math.max(0.62, card.aspectRatio ?? fallbackRatio(kind)));
  return (
    <View style={[styles.media, { aspectRatio: ratio }]}>
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} />
      {kind === "Video" ? (
        // Desktop's only play affordance on a video card; playback happens on the item page.
        <View style={styles.playPill}>
          <SymbolView name="play.fill" size={10} tintColor={colors.text} />
        </View>
      ) : null}
    </View>
  );
}

function typedFor(card: PhoneCard) {
  const kind = card.displayKind;
  if (kind === "Note") {
    const words = wordCount(card.description);
    return {
      label: "NOTE",
      title: card.title ?? card.description?.split("\n")[0] ?? "Untitled note",
      footnote: words ? `${words} WORDS` : undefined,
    };
  }
  if (kind === "PDF")
    return { label: "PDF", title: card.title?.replace(/\.[^.]+$/u, "") ?? "Document" };
  return {
    label: fileExtension(card.title) || kind.toUpperCase(),
    title: card.title ?? kind,
    footnote: card.hasThumbnail ? undefined : "PROCESSING",
  };
}

/** A grid card drawn the way desktop draws its kind. */
export function CardTile({ pairing, card }: { pairing: Pairing; card: PhoneCard }) {
  const image = cardImage(pairing, card);
  const kind = card.displayKind;
  if (kind === "Article") return <ArticleCard card={card} image={image} />;
  if (kind === "Quote") return <QuoteCard card={card} />;
  if (kind === "Post") return <PostCard card={card} />;
  if (image && kind !== "Note") return <MediaCard card={card} image={image} />;
  return <TypedArt {...typedFor(card)} />;
}

const styles = StyleSheet.create({
  typed: {
    height: 196,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.window,
    paddingTop: 22,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontFamily: font.mono, fontSize: 9, letterSpacing: 1.4, color: colors.muted },
  ring: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.muted },
  typedTitle: {
    marginTop: 24,
    fontFamily: font.display,
    fontSize: 17,
    lineHeight: 19,
    letterSpacing: -0.4,
    textTransform: "uppercase",
    color: colors.text,
  },
  dots: { flexDirection: "row", gap: 6, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footnote: {
    marginTop: "auto",
    alignSelf: "flex-end",
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 0.7,
    color: colors.muted,
  },
  paper: { borderRadius: 16, overflow: "hidden", backgroundColor: colors.articlePaper },
  strip: { height: 92, backgroundColor: colors.raised },
  paperText: { padding: 12, gap: 14 },
  paperTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: -0.15,
    color: colors.articleInk,
  },
  paperFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  paperSource: { flexShrink: 1, fontFamily: font.mono, fontSize: 10, color: colors.articleMuted },
  paperArrow: { fontSize: 13, color: colors.articleMuted },
  quote: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surface,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  quoteMark: {
    height: 44,
    fontFamily: "Georgia",
    fontSize: 76,
    lineHeight: 80,
    color: colors.quoteMark,
  },
  quoteText: {
    fontFamily: font.displayRegular,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.3,
    color: colors.quoteText,
  },
  quoteRule: {
    alignSelf: "flex-end",
    width: 80,
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    backgroundColor: colors.quoteRule,
  },
  quoteBy: {
    alignSelf: "flex-end",
    marginTop: 8,
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.quoteKicker,
  },
  post: { borderRadius: 16, backgroundColor: colors.postPaper, padding: 12, gap: 10 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.postAvatar,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInk: { color: colors.postInk, fontSize: 12, fontWeight: "700" },
  postWho: { flex: 1, minWidth: 0 },
  postName: { color: colors.postInk, fontSize: 12, fontWeight: "700" },
  postHandle: { color: colors.postMuted, fontSize: 11 },
  postMark: { color: colors.postInk, fontSize: 14 },
  postText: { color: colors.postInk, fontSize: 13, lineHeight: 18 },
  media: { width: "100%", borderRadius: 16, overflow: "hidden", backgroundColor: colors.raised },
  playPill: {
    position: "absolute",
    left: 10,
    bottom: 10,
    width: 28,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.tileButton,
  },
});
