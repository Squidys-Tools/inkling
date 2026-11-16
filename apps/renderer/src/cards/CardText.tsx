import ArrowUpRight01Icon from "@hugeicons/core-free-icons/ArrowUpRight01Icon";
import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, radius } from "@inkling/ui/tokens.stylex";
import type { CardView } from "../library/cardModel.ts";

function Action({
  view,
  onRead,
  onOpen,
}: {
  view: CardView;
  onRead: () => void;
  onOpen: () => void;
}) {
  if (view.kind === "Article")
    return (
      <button
        type="button"
        disabled={!view.hasArticleContent}
        title={view.hasArticleContent ? "Open reader" : "No saved article text"}
        onClick={(event) => {
          event.stopPropagation();
          onRead();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        {...stylex.props(styles.action, styles.actionOnPaper)}
      >
        Read <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
      </button>
    );
  if (view.isVideoLink)
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        {...stylex.props(styles.action)}
      >
        Watch <HugeiconsIcon icon={PlayIcon} size={11} />
      </button>
    );
  return <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} aria-hidden="true" />;
}

/** The words under a grid article's image: its title, source and Read button. */
export function CardText({
  view,
  onRead,
  onOpen,
}: {
  view: CardView;
  onRead: () => void;
  onOpen: () => void;
}) {
  const source = view.readingMinutes ? `${view.source} · ${view.readingMinutes} min` : view.source;
  return (
    <div {...stylex.props(styles.text)}>
      <h2 {...stylex.props(styles.title)}>{view.title}</h2>
      <div {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.source)}>{source}</span>
        <Action view={view} onRead={onRead} onOpen={onOpen} />
      </div>
    </div>
  );
}

const styles = stylex.create({
  text: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    padding: "16px",
  },
  title: {
    margin: 0,
    fontFamily: font.body,
    fontSize: "16px",
    lineHeight: 1.3,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: cardColor.articleInk,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
    overflow: "hidden",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    color: color.muted,
  },
  source: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.mono,
    fontSize: "11px",
    lineHeight: 1.2,
    color: cardColor.articleMuted,
  },
  action: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: "4px",
    paddingBlock: "4px",
    paddingInline: "9px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.border, ":hover": cardColor.controlEdge },
    backgroundColor: { default: "transparent", ":hover": color.surface },
    color: { default: color.muted, ":hover": color.ink },
    fontFamily: font.body,
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.02em",
    cursor: { default: "pointer", ":disabled": "default" },
    opacity: { default: 1, ":disabled": 0.45 },
    transitionProperty: "color, border-color, background-color",
    transitionDuration: "150ms",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  actionOnPaper: {
    borderColor: { default: cardColor.articleRule, ":hover": cardColor.articleMuted },
    color: { default: cardColor.articleMuted, ":hover": cardColor.articleInk },
    backgroundColor: { default: "transparent", ":hover": cardColor.articleRule },
  },
});
