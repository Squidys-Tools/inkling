import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { fileExtension, hostname, quoteAttribution, wordCount } from "../cards";
import { colors } from "../colors";
import type { PhoneCard } from "../desktop";
import { font } from "../fonts";
import type { Pairing } from "../pairing";
import { useCardImage } from "./useCardImage";

const texture = require("../../assets/cards/typed-texture.png");

/** Notes, PDFs and files share desktop's typed layout: mono label and ring, caps title, three dots. */
export function TypedArt(props: {
  label: string;
  title: string;
  footnote?: string;
  tall?: boolean;
}) {
  return (
    <View style={[styles.typed, props.tall && styles.typedTall]}>
      <Image source={texture} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.labelRow}>
        <Text style={styles.label}>{props.label}</Text>
        <View style={styles.ring} />
      </View>
      <Text style={styles.typedTitle} numberOfLines={3}>
        {props.title}
      </Text>
      <View style={styles.dots}>
        <View style={[styles.dot, { backgroundColor: colors.accentDeep }]} />
        <View style={[styles.dot, { backgroundColor: colors.paperYellow }]} />
        <View style={[styles.dot, { backgroundColor: colors.success }]} />
      </View>
      {props.footnote ? <Text style={styles.footnote}>{props.footnote}</Text> : null}
    </View>
  );
}

function ArticleCard({ card, image }: { card: PhoneCard; image: string | null }) {
  const source = card.source ?? (card.sourceUrl ? hostname(card.sourceUrl) : "");
  return (
    <View style={styles.paper}>
      {image ? (
        <Image source={{ uri: image }} style={styles.strip} contentFit="cover" transition={180} />
      ) : null}
      <View style={styles.paperText}>
        <Text style={styles.paperTitle} numberOfLines={4}>
          {card.title ?? source}
        </Text>
        <View style={styles.paperFooter}>
          <Text style={styles.paperSource} numberOfLines={1}>
            {source}
          </Text>
          <Text style={styles.paperArrow}>↗</Text>
        </View>
      </View>
    </View>
  );
}

function QuoteCard({ card }: { card: PhoneCard }) {
  const attribution = quoteAttribution(card.description);
  return (
    <View style={styles.quote}>
      <Text style={styles.quoteMark}>“</Text>
      <Text style={styles.quoteText} numberOfLines={8}>
        {card.title?.replace(/\s+/gu, " ").trim() || "Saved quote"}
      </Text>
      {attribution ? (
        <>
          <View style={styles.quoteRule} />
          <Text style={styles.quoteBy} numberOfLines={1}>
            {attribution}
          </Text>
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
          <Text style={styles.avatarInk}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.postWho}>
          <Text style={styles.postName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.postHandle} numberOfLines={1}>
            {post?.handle ? `@${post.handle}` : "@x"}
          </Text>
        </View>
        <Text style={styles.postMark}>𝕏</Text>
      </View>
      <Text style={styles.postText} numberOfLines={7}>
        {post?.text || card.description || card.title || "Post preview unavailable."}
      </Text>
    </View>
  );
}

function MediaCard({ card, image }: { card: PhoneCard; image: string }) {
  const ratio = Math.min(1.8, Math.max(0.62, card.aspectRatio ?? 1));
  return (
    <Image
      source={{ uri: image }}
      style={[styles.media, { aspectRatio: ratio }]}
      contentFit="cover"
      transition={180}
    />
  );
}

function typedFor(card: PhoneCard) {
  if (card.displayKind === "Note") {
    const words = wordCount(card.description);
    return {
      label: "NOTE",
      title: card.title ?? card.description?.split("\n")[0] ?? "Untitled note",
      footnote: words ? `${words} WORDS` : undefined,
    };
  }
  if (card.displayKind === "PDF")
    return { label: "PDF", title: card.title?.replace(/\.[^.]+$/u, "") ?? "Document" };
  return {
    label: fileExtension(card.title) || card.displayKind.toUpperCase(),
    title: card.title ?? card.displayKind,
    footnote: card.hasThumbnail ? undefined : "PROCESSING",
  };
}

/** A grid card drawn the way desktop draws its kind. */
export function CardTile({ pairing, card }: { pairing: Pairing; card: PhoneCard }) {
  const image = useCardImage(pairing, card);
  if (card.displayKind === "Article") return <ArticleCard card={card} image={image} />;
  if (card.displayKind === "Quote") return <QuoteCard card={card} />;
  if (card.displayKind === "Post") return <PostCard card={card} />;
  if (image && card.displayKind !== "Note") return <MediaCard card={card} image={image} />;
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
  typedTall: { height: 280, paddingTop: 34, paddingHorizontal: 26 },
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
  media: { width: "100%", borderRadius: 16, backgroundColor: colors.raised },
});
