import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font } from "@inkling/ui/tokens.stylex";
import { type CardView, quoteAttribution } from "../library/cardModel.ts";

/** The card and the item stage draw a quote from the same fields. */
export function quoteArtworkText(view: CardView) {
  return {
    text: view.title.replace(/\s+/gu, " ").trim() || "Saved quote",
    attribution: quoteAttribution(view.description),
  };
}

// In the grid the quote grows the card to fit (up to ten lines); elsewhere it
// fills the box it is given.
export function QuoteArtwork({
  view,
  layout,
}: {
  view: CardView;
  layout: "grid" | "list" | "fill";
}) {
  const { text, attribution } = quoteArtworkText(view);
  const compact = layout === "list";
  return (
    <div {...stylex.props(styles.art, styles[layout])} aria-hidden="true">
      <span {...stylex.props(styles.mark, compact && styles.compactMark)}>“</span>
      <p {...stylex.props(styles.text, compact && styles.compactText)}>{text}</p>
      {attribution && (
        <>
          <span {...stylex.props(styles.rule)} />
          <span {...stylex.props(styles.attribution)}>{attribution}</span>
        </>
      )}
    </div>
  );
}

const styles = stylex.create({
  art: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: color.surface,
    pointerEvents: "none",
  },
  grid: {
    position: "relative",
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: "auto",
    paddingTop: "22px",
    paddingRight: "30px",
    paddingBottom: "40px",
    paddingLeft: "26px",
  },
  list: {
    position: "relative",
    height: "100%",
    minHeight: "155px",
    paddingBlock: "14px",
    paddingInline: "16px",
  },
  fill: {
    position: "absolute",
    inset: 0,
    paddingTop: "22px",
    paddingRight: "30px",
    paddingBottom: "24px",
    paddingLeft: "26px",
  },
  mark: {
    flexShrink: 0,
    height: "58px",
    fontFamily: "Georgia, serif",
    fontSize: "110px",
    lineHeight: "100px",
    color: cardColor.quoteMark,
  },
  compactMark: {
    height: "40px",
    fontSize: "56px",
    lineHeight: "40px",
  },
  text: {
    margin: 0,
    overflow: "hidden",
    fontFamily: font.display,
    fontSize: "18px",
    lineHeight: "128%",
    letterSpacing: "-0.02em",
    overflowWrap: "break-word",
    color: cardColor.quoteText,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 10,
  },
  compactText: {
    fontSize: "15px",
    WebkitLineClamp: 3,
  },
  rule: {
    flexShrink: 0,
    alignSelf: "flex-end",
    width: "120px",
    height: "1px",
    marginTop: "auto",
    backgroundColor: cardColor.quoteRule,
  },
  attribution: {
    flexShrink: 0,
    alignSelf: "flex-end",
    maxWidth: "100%",
    marginTop: "10px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: "12px",
    color: cardColor.quoteKicker,
    opacity: 0.85,
  },
});
