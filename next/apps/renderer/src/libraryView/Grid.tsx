import * as stylex from "@stylexjs/stylex";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { useEffect, useRef, useState } from "react";
import { GridCell, type GridContext } from "../cards/Card.tsx";
import type { CardLayout } from "../cards/CardMedia.tsx";

const gap = 12;
const targetWidth: Record<CardLayout, number> = {
  grid: 286,
  list: Number.POSITIVE_INFINITY,
  archive: 180,
};
const maxColumns = 12;

export function columnCount(width: number, layout: CardLayout) {
  if (layout === "list" || width <= 0) return 1;
  const columns = Math.round((width + gap) / (targetWidth[layout] + gap));
  return Math.min(Math.max(columns, 1), maxColumns);
}

// Rows are loaded a page at a time; the next page is asked for while this many
// pixels of cards are still below the fold.
const loadAhead = 1600;

/**
 * The virtualized masonry. Its width only changes when the frame settles (the
 * sidebar slide moves the frame by transform and lays this out once, at the
 * end), so a resize here is one relayout, never one per frame.
 */
export function Grid({
  ids,
  layout,
  pinnedOffset,
  onNearEnd,
}: {
  ids: readonly string[];
  layout: CardLayout;
  pinnedOffset: boolean;
  onNearEnd: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A first page shorter than the window cannot be scrolled to its end, so
  // the next page is asked for as soon as it renders.
  useEffect(() => {
    if (ids.length === 0) return;
    const scroller = frame.current?.querySelector<HTMLElement>("[data-bench='grid']");
    if (scroller && scroller.scrollHeight - scroller.clientHeight < loadAhead) onNearEnd();
  }, [ids, onNearEnd]);

  const context: GridContext = { layout };
  return (
    <div
      ref={frame}
      {...stylex.props(styles.frame)}
      onScrollCapture={(event) => {
        const scroller = event.target as HTMLElement;
        if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < loadAhead)
          onNearEnd();
      }}
    >
      {width > 0 && (
        <VirtuosoMasonry
          data-bench="grid"
          columnCount={columnCount(width, layout)}
          data={ids as string[]}
          context={context}
          ItemContent={GridCell}
          {...stylex.props(
            styles.masonry,
            layout === "list" && styles.list,
            pinnedOffset && styles.pinned,
          )}
        />
      )}
    </div>
  );
}

const styles = stylex.create({
  frame: {
    position: "absolute",
    inset: 0,
    paddingInline: "14px",
  },
  // The grid scrolls under the search bar and fades out at both edges with a
  // mask rather than stacked blur layers.
  masonry: {
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    minWidth: 0,
    gap: `${gap}px`,
    paddingTop: "36px",
    paddingBottom: "72px",
    scrollbarWidth: "none",
    maskImage:
      "linear-gradient(to bottom, transparent 0, black 30px, black calc(100% - 40px), transparent 100%)",
  },
  list: { gap: 0 },
  // A pinned search has its own row under the bar, so the grid starts below it.
  pinned: { paddingTop: "136px" },
});
