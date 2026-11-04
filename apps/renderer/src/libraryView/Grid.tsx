import * as stylex from "@stylexjs/stylex";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { flushSync } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GridCell, type GridContext } from "../cards/Card.tsx";
import type { CardLayout } from "../cards/CardMedia.tsx";
import { GradualBlur } from "./GradualBlur.tsx";
import { nextGeneration } from "./gridLayout.ts";
import { warmCards } from "../library/cards.ts";
import { viewState } from "./viewState.ts";
import { animateArrival } from "./viewTransition.ts";

const gap = 12;
const sidePadding = 14;
const targetWidth: Record<CardLayout, number> = {
  grid: 286,
  list: Number.POSITIVE_INFINITY,
  archive: 180,
};
const maxColumns = 12;

function columnCount(width: number, layout: CardLayout) {
  if (layout === "list" || width <= 0) return 1;
  const columns = Math.round((width + gap) / (targetWidth[layout] + gap));
  return Math.min(Math.max(columns, 1), maxColumns);
}

// Rows are loaded a page at a time; the next page is asked for while this many
// pixels of cards are still below the fold.
const loadAhead = 1600;

/** Virtualized masonry fills the moving frame. CSS handles cell widths;
 * React changes the column topology only at a responsive breakpoint.
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
  // A list that changes other than at its end gets a fresh masonry (see
  // gridLayout.ts); the scroll position carries over to it.
  const [layoutState, setLayoutState] = useState({ ids, generation: 0 });
  const scrollTop = useRef(0);
  const nextLayout = nextGeneration(layoutState, ids);
  if (nextLayout !== layoutState) setLayoutState(nextLayout);
  const generation = nextLayout.generation;
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (!width || !ids.length || arrived.current) return;
    arrived.current = true;
    const element = frame.current?.querySelector<HTMLElement>("[data-bench='grid']");
    if (!element || viewState.get().entering) return;
    const animations = animateArrival(element, layout === "list");
    return () => animations.forEach((animation) => animation.cancel());
  }, [width, ids.length, layout]);

  // The fresh masonry measures its cells over the next frames, so the old
  // offset is set again each frame until it fits, unless the user scrolls.
  useLayoutEffect(() => {
    const scroller = frame.current?.querySelector<HTMLElement>("[data-bench='grid']");
    if (generation === 0 || !scroller) return;
    const target = scrollTop.current;
    let frames = 0;
    let last = -1;
    let handle = 0;
    const restore = () => {
      if (last >= 0 && Math.abs(scroller.scrollTop - last) > 1) return;
      scroller.scrollTop = target;
      last = scroller.scrollTop;
      scrollTop.current = target;
      frames += 1;
      if (last < target - 1 && frames < 12) handle = requestAnimationFrame(restore);
    };
    restore();
    return () => cancelAnimationFrame(handle);
  }, [generation]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let columns = 0;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width) - 2 * sidePadding;
      if (next <= 0) return;
      const nextColumns = columnCount(next, layout);
      if (nextColumns === columns) return;
      columns = nextColumns;
      // CSS follows the moving frame. React only changes at a column boundary,
      // before paint, never once per pixel of the sidebar's journey.
      flushSync(() => setWidth(next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [layout]);

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
        const forward = scroller.scrollTop >= scrollTop.current;
        scrollTop.current = scroller.scrollTop;
        const indexes = [...scroller.querySelectorAll<HTMLElement>("[data-library-index]")].map(
          (node) => Number(node.dataset.libraryIndex),
        );
        const edge = indexes.length ? (forward ? Math.max(...indexes) : Math.min(...indexes)) : 0;
        warmCards(ids.slice(Math.max(0, edge - (forward ? 0 : 12)), edge + (forward ? 13 : 1)));
        if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < loadAhead)
          onNearEnd();
      }}
    >
      {width > 0 && (
        <VirtuosoMasonry
          key={generation}
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
  // The grid scrolls under the search bar and the dock; GradualBlur softens both edges. The
  // side padding sits inside the scroller so the edge cards’ focus ring and hover shadow are not clipped.
  masonry: {
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    minWidth: 0,
    gap: `${gap}px`,
    paddingInline: `${sidePadding}px`,
    paddingTop: "8px",
    paddingBottom: "72px",
    scrollbarWidth: "none",
  },
  list: { gap: 0 },
  // A pinned search has its own row under the bar, so the grid starts below it.
  pinned: { paddingTop: "136px" },
});
