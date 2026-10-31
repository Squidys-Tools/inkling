/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- A card holds its own buttons, so the article cannot be a button; Enter and Space open the focused card. */
import * as stylex from "@stylexjs/stylex";
import type { KeyboardEvent, MouseEvent } from "react";
import { cardColor, color, motion, radius } from "@inkling/ui/tokens.stylex";
import type { CardView } from "../library/cardModel.ts";
import type { Processing } from "../library/jobs.ts";
import { cardMarker } from "../markers.stylex.ts";
import { CardImage, CardMedia } from "./CardMedia.tsx";
import { CardText } from "./CardText.tsx";
import { ProcessingBadge } from "./Processing.tsx";

// The first rows load their images ahead of the rest.
const priorityCount = 8;

/** A card as it draws, apart from the library stores, so the marketing site can show real cards. */
export function CardFace({
  view,
  index,
  list,
  selected,
  processing,
  onOpen,
  onRead,
  onMenu,
}: {
  view: CardView;
  index: number;
  list: boolean;
  selected: boolean;
  processing: Processing | undefined;
  onOpen: () => void;
  onRead: () => void;
  onMenu: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void;
}) {
  const gridArticle = !list && view.treatment === "article";

  return (
    <div
      {...stylex.props(styles.cell, list && styles.listCell, cardMarker)}
      data-library-index={index}
    >
      {!list && <span {...stylex.props(styles.lift)} aria-hidden="true" />}
      <article
        tabIndex={0}
        aria-label={`${view.kind}: ${view.title}`}
        data-bench="card"
        data-item-id={view.id}
        onClick={onOpen}
        onContextMenu={onMenu}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
            return onMenu(event);
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpen();
        }}
        {...stylex.props(
          styles.card,
          list ? styles.listShape : shapes[view.treatment],
          !list && view.treatment === "media" && styles.ratio(view.aspectRatio),
          view.kind === "Article" ? styles.paper : styles.surface,
          selected && styles.selected,
        )}
      >
        {gridArticle ? (
          view.image && (
            <div {...stylex.props(styles.strip)}>
              <CardImage view={view} priority={index < priorityCount} />
            </div>
          )
        ) : (
          <div
            {...stylex.props(
              list ? styles.rowMedia : view.treatment === "quote" ? styles.quoteMedia : null,
            )}
          >
            <CardMedia
              view={view}
              layout={list ? "list" : "grid"}
              priority={index < priorityCount}
            />
          </div>
        )}
        {(list || gridArticle) && (
          <CardText
            view={view}
            list={list}
            processing={processing}
            onRead={onRead}
            onOpen={onOpen}
          />
        )}
        {!list && processing && <ProcessingBadge processing={processing} />}
      </article>
    </div>
  );
}

const shapes = stylex.create({
  article: { display: "flex", flexDirection: "column", height: "250px" },
  quote: { display: "flex", flexDirection: "column", minHeight: "250px" },
  note: { height: "300px" },
  pdf: { height: "300px" },
  file: { height: "300px" },
  video: { height: "190px" },
  media: {},
});

const styles = stylex.create({
  cell: {
    position: "relative",
    boxSizing: "border-box",
    minWidth: 0,
    paddingBottom: "12px",
  },
  listCell: { paddingBottom: "9px" },
  // The hover shadow fades in on its own layer, so hovering animates opacity
  // and transform only and never repaints the card.
  lift: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: "12px",
    borderRadius: radius.card,
    boxShadow: `0 10px 24px ${cardColor.hoverShadow}`,
    opacity: { default: 0, [stylex.when.ancestor(":hover", cardMarker)]: 1 },
    transform: "translateY(-2px)",
    transitionProperty: "opacity",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.standard,
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    borderRadius: radius.card,
    cursor: "pointer",
    contain: "layout paint",
    transform: {
      default: "none",
      [stylex.when.ancestor(":hover", cardMarker)]: "translateY(-2px)",
      ":focus-visible": "translateY(-2px)",
    },
    transitionProperty: "transform",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.standard,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
  ratio: (ratio: number) => ({ aspectRatio: ratio }),
  surface: { backgroundColor: color.surface },
  paper: { backgroundColor: cardColor.articlePaper },
  listShape: {
    display: "grid",
    gridTemplateColumns: "155px minmax(0, 1fr)",
    borderRadius: radius.panel,
  },
  selected: {
    "::after": {
      content: "''",
      position: "absolute",
      inset: 0,
      zIndex: 5,
      borderRadius: "inherit",
      boxShadow: `inset 0 0 0 1px ${color.accent}`,
      pointerEvents: "none",
    },
  },
  strip: {
    position: "relative",
    height: "120px",
    flexShrink: 0,
    overflow: "hidden",
    backgroundColor: color.raised,
  },
  rowMedia: { position: "relative", minWidth: 0 },
  quoteMedia: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: "auto",
    minWidth: 0,
  },
});
