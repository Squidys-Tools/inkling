import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, radius, text } from "@inkling/ui/tokens.stylex";
import { type CardView, cardView } from "../library/cardModel.ts";
import type { DescribedItem } from "./model.ts";
import { useLibraryQuery } from "./useLibraryQuery.ts";

// Tiles sit in two 139px columns. An image's height follows its shape within
// the range the old design used; other tiles have fixed heights.
const TILE_WIDTH = 139;
const TILE_GAP = 8;

function tileHeight(view: CardView) {
  if (view.image) return Math.round(Math.min(200, Math.max(100, TILE_WIDTH / view.aspectRatio)));
  if (view.kind === "Quote") return 150;
  if (view.kind === "Note") return 170;
  return 120;
}

// Each tile goes to the shorter column, so the columns end at similar heights.
function columns(views: readonly CardView[]) {
  const split: [CardView[], CardView[]] = [[], []];
  const heights = [0, 0];
  for (const view of views) {
    const shorter = heights[0] <= heights[1] ? 0 : 1;
    split[shorter].push(view);
    heights[shorter] += tileHeight(view) + TILE_GAP;
  }
  return split;
}

/** Items that look or read like this one. Loads once per item, while the tab is open. */
export function SimilarPanel({
  item,
  onOpen,
}: {
  item: DescribedItem;
  onOpen: (id: string) => void;
}) {
  const similar = useLibraryQuery(
    `similar:${item.id}`,
    async (client) => {
      const by = item.kind === "Image" ? "image" : "text";
      const cards = await client.similar({ id: item.id, by, limit: 24 });
      return cards.filter((card) => card.id !== item.id).map(cardView);
    },
    () => false,
  );
  if (similar.error) return <p {...stylex.props(styles.note)}>{similar.error}</p>;
  if (!similar.value) return null;
  if (similar.value.length === 0) return <p {...stylex.props(styles.note)}>Nothing similar yet.</p>;
  return (
    <div {...stylex.props(styles.columns)}>
      {columns(similar.value).map((column, index) => (
        <div key={index === 0 ? "left" : "right"} {...stylex.props(styles.column)}>
          {column.map((view) => (
            <SimilarTile key={view.id} view={view} onOpen={() => onOpen(view.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SimilarTile({ view, onOpen }: { view: CardView; onOpen: () => void }) {
  const height = styles.height(tileHeight(view));
  if (view.image)
    return (
      <button
        type="button"
        aria-label={view.title}
        onClick={onOpen}
        {...stylex.props(styles.tile, height)}
      >
        <img
          src={view.image}
          alt=""
          loading="lazy"
          decoding="async"
          {...stylex.props(styles.image)}
        />
      </button>
    );
  if (view.kind === "Quote")
    return (
      <button
        type="button"
        aria-label={view.title}
        onClick={onOpen}
        {...stylex.props(styles.tile, styles.textTile, styles.quote, height)}
      >
        <span aria-hidden="true" {...stylex.props(styles.mark)}>
          “
        </span>
        <span {...stylex.props(styles.quoteText)}>{view.title}</span>
        {view.description && (
          <span {...stylex.props(styles.small, styles.end, styles.quoteMeta)}>
            {view.description.replace(/^—\s*/u, "")}
          </span>
        )}
      </button>
    );
  return (
    <button
      type="button"
      aria-label={view.title}
      onClick={onOpen}
      {...stylex.props(
        styles.tile,
        styles.textTile,
        view.kind === "Note" && styles.noteTile,
        height,
      )}
    >
      <span {...stylex.props(styles.small)}>{view.kind}</span>
      <span {...stylex.props(view.kind === "Note" ? styles.noteTitle : styles.titleText)}>
        {view.title}
      </span>
    </button>
  );
}

const styles = stylex.create({
  note: { margin: 0, fontSize: text.md, lineHeight: "20px", color: color.muted },
  columns: { display: "flex", alignItems: "flex-start", gap: `${TILE_GAP}px` },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: `${TILE_GAP}px`,
    flexBasis: `${TILE_WIDTH}px`,
    flexShrink: 0,
    minWidth: 0,
  },
  height: (value: number) => ({ height: `${value}px` }),
  tile: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: "6px",
    width: "100%",
    overflow: "hidden",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.tile,
    backgroundColor: "transparent",
    textAlign: "left",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  image: { display: "block", width: "100%", height: "100%", objectFit: "cover" },
  textTile: {
    padding: "14px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.border, ":hover": color.borderStrong },
    backgroundColor: color.surface,
    color: color.ink,
  },
  noteTile: { backgroundColor: color.sunken },
  quote: { color: cardColor.quoteText },
  mark: {
    fontFamily: "Georgia, serif",
    fontSize: "26px",
    lineHeight: "20px",
    color: cardColor.quoteMark,
  },
  quoteText: {
    fontFamily: font.display,
    fontSize: text.sm,
    lineHeight: "17px",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 6,
    overflow: "hidden",
  },
  quoteMeta: { color: cardColor.quoteKicker },
  small: {
    fontFamily: font.mono,
    fontSize: "9px",
    lineHeight: "12px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: color.muted,
  },
  end: { textAlign: "right", letterSpacing: 0, textTransform: "none" },
  noteTitle: {
    fontFamily: font.display,
    fontSize: "14px",
    lineHeight: "16px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    textTransform: "uppercase",
    overflowWrap: "anywhere",
    color: color.ink,
  },
  titleText: {
    fontFamily: font.display,
    fontSize: text.sm,
    lineHeight: "17px",
    overflowWrap: "anywhere",
    color: color.inkSoft,
  },
});
