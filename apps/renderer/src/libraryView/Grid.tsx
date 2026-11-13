import * as stylex from "@stylexjs/stylex";
import { useVirtualizer } from "@tanstack/react-virtual";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { GridCell } from "../cards/Card.tsx";
import type { CardLayout } from "../cards/CardMedia.tsx";
import { GradualBlur } from "./GradualBlur.tsx";
import { relayoutLanes } from "./masonryLanes.ts";
import { warmCards } from "../library/cards.ts";
import { useAppearance } from "../settings/appearance.ts";
import { viewState } from "./viewState.ts";
import { animateArrival } from "./viewTransition.ts";

const gap = 12;
const sidePadding = 14;
// Below this width a card's contents no longer fit, so the whole card is drawn smaller instead.
const designWidth: Record<CardLayout, number> = { grid: 220, list: 0, archive: 160 };
const estimatedHeight: Record<CardLayout, number> = { grid: 300, list: 96, archive: 190 };

// Archive tiles are smaller than cards, so the archive shows two more columns than the library.
function columnCount(gridColumns: number, layout: CardLayout) {
  if (layout === "list") return 1;
  return layout === "archive" ? gridColumns + 2 : gridColumns;
}

// Rows are loaded a page at a time; the next page is asked for while this many
// pixels of cards are still below the fold.
const loadAhead = 1600;
const warmAhead = 12;

/** Virtualized masonry fills the moving frame. The column count is the user's Appearance
 * choice and never follows the width: CSS scales the cells as the frame resizes.
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
  const scroller = useRef<HTMLDivElement>(null);
  const cells = useRef<HTMLDivElement>(null);
  const columns = columnCount(Number(useAppearance().gridColumns), layout);
  const [, render] = useReducer((count: number) => count + 1, 0);
  const itemKey = useCallback((index: number) => ids[index], [ids]);
  // Sizes are cached by item id, so a list that changes anywhere keeps every measured card.
  // oxlint-disable-next-line react/incompatible-library -- The React Compiler skips Grid, which must read the mutable virtualizer on every render.
  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => estimatedHeight[layout],
    getItemKey: itemKey,
    lanes: columns,
    // A card takes the shortest column once its real height is known, not by its estimate.
    laneAssignmentMode: "measured",
    // The first row starts below the floating search bar. A pinned search has its own row under the bar.
    paddingStart: pinnedOffset ? 136 : 70,
    paddingEnd: 72,
    overscan: 2,
    // A cell's new height arrives in a ResizeObserver callback, whose update React renders
    // after the next paint: one frame of overlapping cards per resize. Render before it.
    onChange: (instance) => {
      if (!instance.isScrolling) queueMicrotask(() => flushSync(render));
    },
  });
  const laidOut = useRef(ids);
  useLayoutEffect(() => {
    relayoutLanes(virtualizer, laidOut.current, ids);
    laidOut.current = ids;
  }, [virtualizer, ids]);

  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items.at(-1)?.index ?? 0;
  const backward = virtualizer.scrollDirection === "backward";

  // The first cards are placed by estimate until their heights are read, so they fade in once measured.
  const measured =
    items.length > 0 && items.every((item) => virtualizer.itemSizeCache.has(item.key));
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (!measured || arrived.current) return;
    arrived.current = true;
    const element = scroller.current;
    if (element && !viewState.get().entering) animateArrival(element, layout === "list");
  }, [measured, layout]);

  // Written straight to the element: the width changes on every frame of the sidebar's
  // journey, and React must not render once per pixel.
  useLayoutEffect(() => {
    const element = cells.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = (entry.contentRect.width + gap) / columns - gap;
      const zoom = Math.min(1, width / designWidth[layout]);
      element.style.setProperty("--card-zoom", String(zoom > 0 ? zoom : 1));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [columns, layout]);

  useEffect(() => {
    warmCards(
      backward
        ? ids.slice(Math.max(0, first - warmAhead), first)
        : ids.slice(last + 1, last + 1 + warmAhead),
    );
  }, [ids, first, last, backward]);

  // Also covers a first page shorter than the window, which cannot be scrolled to its end.
  useEffect(() => {
    const element = scroller.current;
    if (ids.length > 0 && element)
      if (element.scrollHeight - element.scrollTop - element.clientHeight < loadAhead) onNearEnd();
  }, [ids, last, onNearEnd]);

  return (
    <div {...stylex.props(styles.frame)}>
      <div ref={scroller} data-bench="grid" {...stylex.props(styles.scroller)}>
        <div ref={cells} {...stylex.props(styles.cells(virtualizer.getTotalSize()))}>
          {items.map((item) => (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              {...stylex.props(styles.cell(item.lane, columns, item.start))}
            >
              <div {...stylex.props(styles.zoomed)}>
                <GridCell id={ids[item.index]} index={item.index} layout={layout} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <GradualBlur edge="top" />
      <GradualBlur edge="bottom" />
    </div>
  );
}

const styles = stylex.create({
  frame: {
    position: "absolute",
    inset: 0,
  },
  // The grid scrolls under the search bar and the dock, and GradualBlur blurs both edges.
  // The side padding sits inside the scroller so the edge cards' focus ring and hover
  // shadow are not clipped.
  scroller: {
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    overflowY: "auto",
    paddingInline: `${sidePadding}px`,
    scrollbarWidth: "none",
    // Keeps the z-indexes inside cards below the search bar and the blur; without it an
    // archive tile's Restore button sits over the search pill and takes its clicks.
    isolation: "isolate",
  },
  cells: (height: number) => ({ position: "relative", width: "100%", height: `${height}px` }),
  zoomed: { zoom: "var(--card-zoom, 1)" },
  cell: (lane: number, columns: number, top: number) => ({
    position: "absolute",
    top: 0,
    left: `calc(${lane} * (100% + ${gap}px) / ${columns})`,
    width: `calc((100% + ${gap}px) / ${columns} - ${gap}px)`,
    transform: `translateY(${top}px)`,
  }),
});
