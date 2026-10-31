import { ArrowUpRight01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, radius } from "@inkling/ui/tokens.stylex";
import { type CardView, quoteAttribution } from "../library/cardModel.ts";
import type { Processing } from "../library/jobs.ts";
import { KindIcon } from "./KindIcon.tsx";
import { ProcessingRows } from "./Processing.tsx";

const quoted = (title: string) => (/^["“]/u.test(title.trim()) ? title : `“${title}”`);

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

/**
 * The words under a card's media: the whole text column of a list row, and
 * just the title and source of a grid article.
 */
export function CardText({
  view,
  list,
  processing,
  onRead,
  onOpen,
}: {
  view: CardView;
  list: boolean;
  processing: Processing | undefined;
  onRead: () => void;
  onOpen: () => void;
}) {
  const article = view.kind === "Article";
  const quote = view.kind === "Quote";
  const note = view.kind === "Note";
  const source = view.readingMinutes ? `${view.source} · ${view.readingMinutes} min` : view.source;
  const footer = (
    <div
      {...stylex.props(
        styles.footer,
        list && styles.footerRule,
        list && article && styles.footerRuleOnPaper,
      )}
    >
      <span {...stylex.props(styles.source, article && styles.onPaperMuted)}>{source}</span>
      <Action view={view} onRead={onRead} onOpen={onOpen} />
    </div>
  );

  if (!list)
    return (
      <div {...stylex.props(styles.gridArticle)}>
        <h2 {...stylex.props(styles.title, styles.articleTitle, styles.flush)}>{view.title}</h2>
        {footer}
      </div>
    );

  return (
    <div {...stylex.props(styles.listText, quote && styles.quoteText)}>
      <div
        {...stylex.props(
          styles.kicker,
          article && styles.onPaperMuted,
          note && styles.noteKicker,
          quote && styles.quoteKicker,
        )}
      >
        <span {...stylex.props(styles.kickerKind)}>
          <KindIcon kind={view.kind} />
          {view.kind}
        </span>
        <span>{view.date}</span>
      </div>
      <h2
        {...stylex.props(
          styles.title,
          quote
            ? styles.quoteTitle
            : article
              ? styles.articleTitle
              : note
                ? styles.noteTitle
                : styles.plainTitle,
        )}
      >
        {quote ? quoted(view.title) : view.title}
      </h2>
      <p
        {...stylex.props(
          quote ? styles.attribution : styles.description,
          article && styles.onPaperMuted,
          note && styles.noteText,
        )}
      >
        {quote ? quoteAttribution(view.description) : view.description}
      </p>
      {processing && <ProcessingRows processing={processing} onPaper={article} />}
      {footer}
    </div>
  );
}

const styles = stylex.create({
  gridArticle: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    padding: "16px",
  },
  listText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    paddingTop: "17px",
    paddingInline: "18px",
    paddingBottom: "16px",
  },
  quoteText: {
    backgroundColor: color.surface,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: cardColor.quoteEdge,
  },
  kicker: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: 1.2,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: color.muted,
  },
  kickerKind: { display: "flex", alignItems: "center", gap: "6px" },
  noteKicker: { color: cardColor.noteKicker },
  quoteKicker: { color: cardColor.quoteKicker },
  title: {
    marginTop: "13px",
    marginBottom: "7px",
    marginInline: 0,
    color: color.ink,
  },
  flush: { margin: 0 },
  plainTitle: {
    fontFamily: font.display,
    fontSize: "17px",
    lineHeight: 1.22,
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  noteTitle: {
    fontFamily: font.display,
    fontSize: "19px",
    lineHeight: 1.22,
    fontWeight: 600,
    letterSpacing: "-0.025em",
  },
  quoteTitle: {
    fontFamily: font.display,
    fontSize: "16px",
    lineHeight: 1.28,
    fontWeight: 400,
    letterSpacing: "-0.01em",
  },
  articleTitle: {
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
  description: {
    margin: 0,
    maxWidth: "56ch",
    fontFamily: font.display,
    fontSize: "12px",
    lineHeight: 1.52,
    color: color.muted,
  },
  attribution: {
    margin: 0,
    minHeight: "37px",
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: 1.45,
    color: color.muted,
  },
  noteText: { color: cardColor.noteText },
  onPaperMuted: { color: cardColor.articleMuted },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    color: color.muted,
  },
  footerRule: {
    marginTop: "auto",
    paddingTop: "11px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
  },
  footerRuleOnPaper: { borderTopColor: cardColor.articleRule },
  source: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.mono,
    fontSize: "11px",
    lineHeight: 1.2,
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
