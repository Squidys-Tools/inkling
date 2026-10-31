import {
  CheckmarkBadge01Icon,
  HeartIcon,
  Message01Icon,
  RepeatIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, font, radius } from "@inkling/ui/tokens.stylex";
import type { PostArt } from "../library/cardModel.ts";

/** A drawn X post: the card never loads X's own embed, which only the item view plays. */
export function PostArtwork({
  post,
  compact = false,
  style,
}: {
  post: PostArt;
  /** A small tile: the post's text without its date and actions. */
  compact?: boolean;
  style?: stylex.StyleXStyles;
}) {
  return (
    <div {...stylex.props(styles.art, style)} aria-hidden="true">
      <div {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.avatar)}>
          {post.displayName.trim().charAt(0).toLowerCase() || "x"}
          {post.avatarUrl && (
            <img
              src={post.avatarUrl}
              alt=""
              decoding="async"
              {...stylex.props(styles.avatarImage)}
            />
          )}
        </span>
        <span {...stylex.props(styles.byline)}>
          <strong {...stylex.props(styles.name)}>{post.displayName}</strong>
          <HugeiconsIcon icon={CheckmarkBadge01Icon} size={13} />
          <small {...stylex.props(styles.handle)}>{post.handle}</small>
        </span>
        <span {...stylex.props(styles.logo)}>X</span>
      </div>
      <p {...stylex.props(styles.body, compact && styles.compactBody)}>{post.body}</p>
      {!compact && (
        <>
          <div {...stylex.props(styles.published)}>{post.published}</div>
          <div {...stylex.props(styles.actions)}>
            <HugeiconsIcon icon={Message01Icon} size={14} />
            <HugeiconsIcon icon={RepeatIcon} size={14} />
            <HugeiconsIcon icon={HeartIcon} size={14} />
            <HugeiconsIcon icon={Share08Icon} size={14} />
          </div>
        </>
      )}
    </div>
  );
}

const styles = stylex.create({
  art: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: "20px",
    backgroundColor: cardColor.postPaper,
    color: cardColor.postInk,
    pointerEvents: "none",
  },
  header: { display: "flex", alignItems: "center", gap: "9px" },
  avatar: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    width: "28px",
    height: "28px",
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: radius.round,
    backgroundColor: cardColor.postInk,
    color: cardColor.postAvatarInk,
    fontFamily: font.body,
    fontSize: "15px",
    lineHeight: 1,
    fontWeight: 500,
  },
  avatarImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  byline: {
    display: "grid",
    gridTemplateColumns: "auto auto",
    alignItems: "center",
    columnGap: "4px",
    minWidth: 0,
  },
  name: { fontSize: "12px", fontWeight: 600 },
  handle: {
    gridColumn: "1 / -1",
    fontFamily: font.body,
    fontSize: "10px",
    color: cardColor.postMuted,
  },
  logo: {
    marginLeft: "auto",
    fontFamily: font.body,
    fontSize: "17px",
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: "-0.1em",
  },
  body: {
    marginTop: "auto",
    marginBottom: "13px",
    marginInline: 0,
    minHeight: 0,
    maxWidth: "22ch",
    fontFamily: font.body,
    fontSize: "20px",
    lineHeight: 1.2,
    fontWeight: 500,
    letterSpacing: "-0.035em",
  },
  compactBody: {
    marginBottom: 0,
    fontSize: "16px",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    overflow: "hidden",
  },
  published: {
    paddingTop: "10px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: cardColor.postRule,
    fontFamily: font.body,
    fontSize: "10px",
    color: cardColor.postMuted,
  },
  actions: {
    display: "flex",
    gap: "17px",
    marginTop: "13px",
    color: cardColor.postMuted,
  },
});
