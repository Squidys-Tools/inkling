import NewTwitterIcon from "@hugeicons/core-free-icons/NewTwitterIcon";
import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { Fragment } from "react";
import { cardColor, color, font, radius } from "@inkling/ui/tokens.stylex";
import {
  formatDuration,
  type PostArt,
  type PostAuthor,
  type PostMedia,
  type PostPart,
} from "../library/cardModel.ts";

/**
 * `card` is the grid's post at its own height; `compact` fills a small tile or a list row with
 * the header and a few lines; `stage` is the item view's, scrolling when the post runs long.
 */
export type PostLayout = "card" | "compact" | "stage";

/** A drawn X post: the card never loads X's own embed, which only the item view plays. */
export function PostArtwork({
  post,
  layout = "card",
  style,
}: {
  post: PostArt;
  layout?: PostLayout;
  style?: stylex.StyleXStyles;
}) {
  const full = layout !== "compact";
  return (
    <div
      {...stylex.props(styles.art, layouts[layout], style)}
      aria-hidden={layout === "stage" ? undefined : true}
    >
      <div {...stylex.props(styles.header)}>
        <Avatar author={post} size="large" />
        <div {...stylex.props(styles.who)}>
          <div {...stylex.props(styles.nameRow)}>
            <span {...stylex.props(styles.name)}>{post.displayName}</span>
            {post.verified && <VerifiedBadge kind={post.verified} />}
          </div>
          <div {...stylex.props(styles.handle)}>
            {post.handle}
            {post.published && ` · ${post.published}`}
          </div>
        </div>
        <span {...stylex.props(styles.logo)}>
          <HugeiconsIcon icon={NewTwitterIcon} size={15} strokeWidth={2} />
        </span>
      </div>
      {full && post.replyTo && (
        <p {...stylex.props(styles.context)}>
          Replying to <span {...stylex.props(styles.link)}>@{post.replyTo}</span>
        </p>
      )}
      {post.parts.length > 0 && (
        <p {...stylex.props(styles.body, bodyClamp[layout])}>
          <PostText parts={post.parts} />
        </p>
      )}
      {full && post.media.length > 0 && <MediaGrid media={post.media} />}
      {full && post.quote && (
        <div {...stylex.props(styles.box, styles.quote)}>
          <div {...stylex.props(styles.quoteHeader)}>
            <Avatar author={post.quote} size="small" />
            <span {...stylex.props(styles.quoteName)}>{post.quote.displayName}</span>
            {post.quote.verified && <VerifiedBadge kind={post.quote.verified} />}
            <span {...stylex.props(styles.quoteHandle)}>
              {post.quote.handle}
              {post.quote.published && ` · ${post.quote.published}`}
            </span>
          </div>
          <div {...stylex.props(styles.quoteBody)}>
            <p {...stylex.props(styles.quoteText)}>
              <PostText parts={post.quote.parts} />
            </p>
            {post.quote.image && (
              <img
                src={post.quote.image}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                {...stylex.props(styles.quoteImage)}
              />
            )}
          </div>
        </div>
      )}
      {full && post.linkCard && (
        <div {...stylex.props(styles.box, !post.linkCard.large && styles.linkRow)}>
          {post.linkCard.image && (
            <img
              src={post.linkCard.image}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              {...stylex.props(
                styles.linkImage,
                post.linkCard.large ? styles.ratio(post.linkCard.ratio) : styles.linkThumb,
              )}
            />
          )}
          <div {...stylex.props(styles.linkText)}>
            <span {...stylex.props(styles.linkTitle)}>{post.linkCard.title}</span>
            {post.linkCard.domain && (
              <small {...stylex.props(styles.linkDomain)}>From {post.linkCard.domain}</small>
            )}
          </div>
        </div>
      )}
      {full && post.poll && (
        <div {...stylex.props(styles.poll)}>
          {post.poll.choices.map((choice) => (
            <div
              key={choice.label}
              {...stylex.props(styles.choice, choice.winner && styles.winner)}
            >
              {choice.percent !== undefined && (
                <span
                  {...stylex.props(
                    styles.bar,
                    choice.winner && styles.winningBar,
                    styles.barWidth(choice.percent),
                  )}
                />
              )}
              <span {...stylex.props(styles.choiceLabel)}>{choice.label}</span>
              {choice.percent !== undefined && (
                <span {...stylex.props(styles.choicePercent)}>{choice.percent}%</span>
              )}
            </div>
          ))}
          {post.poll.summary && (
            <small {...stylex.props(styles.pollSummary)}>{post.poll.summary}</small>
          )}
        </div>
      )}
    </div>
  );
}

function PostText({ parts }: { parts: PostPart[] }) {
  let offset = 0;
  return parts.map((part) => {
    const key = offset;
    offset += part.text.length;
    return part.link ? (
      <span key={key} {...stylex.props(styles.link)}>
        {part.text}
      </span>
    ) : (
      <Fragment key={key}>{part.text}</Fragment>
    );
  });
}

function Avatar({ author, size }: { author: PostAuthor; size: "large" | "small" }) {
  const initial = Array.from(author.displayName.trim())[0]?.toLowerCase() ?? "x";
  return (
    <span
      {...stylex.props(
        styles.avatar,
        size === "large" ? styles.avatarLarge : styles.avatarSmall,
        author.squareAvatar && (size === "large" ? styles.squareLarge : styles.squareSmall),
      )}
    >
      {initial}
      {author.avatarUrl && (
        <img
          src={author.avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          {...stylex.props(styles.cover)}
        />
      )}
    </span>
  );
}

function VerifiedBadge({ kind }: { kind: NonNullable<PostAuthor["verified"]> }) {
  return (
    <svg viewBox="0 0 24 24" {...stylex.props(styles.badge)}>
      <path
        d="M12 1.6l2.6 2 3.2-.3 1 3.1 2.8 1.6-.9 3.1.9 3.1-2.8 1.6-1 3.1-3.2-.3-2.6 2-2.6-2-3.2.3-1-3.1-2.8-1.6.9-3.1-.9-3.1 2.8-1.6 1-3.1 3.2.3z"
        {...stylex.props(badgeFill[kind])}
      />
      <path
        d="M8 12.3l2.7 2.6L16.2 9.4"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...stylex.props(styles.badgeCheck)}
      />
    </svg>
  );
}

function MediaGrid({ media }: { media: PostMedia[] }) {
  const count = media.length;
  return (
    <div
      {...stylex.props(
        styles.box,
        styles.media,
        styles.ratio(count === 1 ? media[0].ratio : 16 / 10),
        count > 1 && styles.twoColumns,
        count > 2 && styles.twoRows,
      )}
    >
      {media.map((item, index) => (
        <div
          key={item.url}
          {...stylex.props(styles.tile, count === 3 && index === 0 && styles.tallTile)}
        >
          <img
            src={item.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            {...stylex.props(styles.cover)}
          />
          {item.kind !== "photo" && (
            <span {...stylex.props(styles.pill)}>
              {item.kind === "gif" ? (
                "GIF"
              ) : (
                <>
                  <HugeiconsIcon icon={PlayIcon} size={9} />
                  {item.durationSeconds !== undefined && formatDuration(item.durationSeconds)}
                </>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const layouts = stylex.create({
  card: {},
  compact: {
    height: "100%",
    overflow: "hidden",
    paddingTop: "12px",
    paddingInline: "12px",
    paddingBottom: "12px",
  },
  stage: {
    height: "100%",
    overflowY: "auto",
    paddingTop: "28px",
    // Clears the item view's Load post from X button.
    paddingBottom: "76px",
    paddingInline: "max(28px, calc((100% - 560px) / 2))",
    fontSize: "15px",
    pointerEvents: "auto",
  },
});

const bodyClamp = stylex.create({
  card: { WebkitLineClamp: 8 },
  compact: { WebkitLineClamp: 3 },
  stage: { display: "block" },
});

const badgeFill = stylex.create({
  blue: { fill: cardColor.verifiedBlue },
  business: { fill: cardColor.verifiedGold },
  government: { fill: cardColor.postMuted },
});

const styles = stylex.create({
  art: {
    boxSizing: "border-box",
    paddingTop: "14px",
    paddingInline: "14px",
    paddingBottom: "14px",
    backgroundColor: cardColor.postPaper,
    color: cardColor.postInk,
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: 1.38,
    pointerEvents: "none",
  },
  header: { display: "flex", alignItems: "flex-start", gap: "9px" },
  avatar: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: radius.round,
    backgroundColor: cardColor.postInk,
    color: cardColor.postAvatarInk,
    lineHeight: 1,
    fontWeight: 600,
  },
  avatarLarge: { width: "32px", height: "32px", fontSize: "14px" },
  avatarSmall: { width: "16px", height: "16px", fontSize: "8px" },
  // X draws business and government accounts' avatars as rounded squares.
  squareLarge: { borderRadius: "7px" },
  squareSmall: { borderRadius: "4px" },
  cover: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  who: { flexGrow: 1, minWidth: 0, lineHeight: 1.2 },
  nameRow: { display: "flex", alignItems: "center", gap: "3px", minWidth: 0 },
  name: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "13px",
    fontWeight: 700,
  },
  handle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "12px",
    color: cardColor.postMuted,
  },
  logo: { display: "flex", flexShrink: 0, marginTop: "1px" },
  badge: { flexShrink: 0, width: "13px", height: "13px" },
  badgeCheck: { fill: "none", stroke: cardColor.postPaper },
  context: {
    marginTop: "8px",
    marginBottom: "-4px",
    marginInline: 0,
    fontSize: "12px",
    color: cardColor.postMuted,
  },
  link: { color: cardColor.postLink },
  body: {
    marginTop: "9px",
    marginBottom: 0,
    marginInline: 0,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  box: {
    marginTop: "10px",
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: cardColor.postRule,
    borderRadius: radius.tile,
  },
  ratio: (ratio: number) => ({ aspectRatio: ratio }),
  media: { display: "grid", gap: "2px", backgroundColor: cardColor.postRule },
  twoColumns: { gridTemplateColumns: "1fr 1fr" },
  twoRows: { gridTemplateRows: "1fr 1fr" },
  tile: { position: "relative", minWidth: 0, minHeight: 0, backgroundColor: cardColor.postBar },
  tallTile: { gridRow: "1 / 3" },
  pill: {
    position: "absolute",
    left: "8px",
    bottom: "8px",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    paddingBlock: "3px",
    paddingLeft: "7px",
    paddingRight: "8px",
    borderRadius: radius.round,
    backgroundColor: cardColor.tileButton,
    color: color.ink,
    fontFamily: font.mono,
    fontSize: "10.5px",
    lineHeight: "14px",
  },
  quote: { paddingBlock: "9px", paddingInline: "10px" },
  quoteHeader: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    minWidth: 0,
    fontSize: "12px",
    whiteSpace: "nowrap",
  },
  quoteName: {
    flexShrink: 0,
    maxWidth: "60%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontWeight: 700,
  },
  quoteHandle: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: cardColor.postMuted,
  },
  quoteBody: { display: "flex", gap: "8px", marginTop: "5px" },
  quoteText: {
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    fontSize: "12.5px",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
    overflow: "hidden",
  },
  quoteImage: {
    flexShrink: 0,
    width: "56px",
    height: "56px",
    borderRadius: "8px",
    objectFit: "cover",
    backgroundColor: cardColor.postBar,
  },
  linkRow: { display: "flex", alignItems: "center" },
  linkImage: {
    display: "block",
    width: "100%",
    objectFit: "cover",
    backgroundColor: cardColor.postBar,
  },
  linkThumb: { flexShrink: 0, width: "64px", height: "64px" },
  linkText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    paddingTop: "7px",
    paddingInline: "10px",
    paddingBottom: "9px",
    fontSize: "12.5px",
  },
  linkTitle: {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
  },
  linkDomain: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "11.5px",
    color: cardColor.postMuted,
  },
  poll: { display: "grid", gap: "5px", marginTop: "10px" },
  choice: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    height: "28px",
    paddingInline: "9px",
    overflow: "hidden",
    borderRadius: "7px",
    fontSize: "12.5px",
  },
  winner: { fontWeight: 700 },
  bar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: "7px",
    backgroundColor: cardColor.postBar,
  },
  winningBar: { backgroundColor: cardColor.postBarWin },
  barWidth: (percent: number) => ({ width: `${percent}%` }),
  choiceLabel: {
    position: "relative",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  choicePercent: { position: "relative", flexShrink: 0 },
  pollSummary: { marginTop: "2px", fontSize: "11.5px", color: cardColor.postMuted },
});
