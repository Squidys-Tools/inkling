import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { type RefObject, useMemo } from "react";
import GradualBlur, { type GradualBlurProps } from "../../components/GradualBlur/GradualBlur";
import { LiquidGlass } from "../../components/LiquidGlass";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import { LibraryCard, type LibraryCardContext } from "./LibraryCard";

// Blurs the grid out at the frame edges instead of hard-clipping it. Rendered in
// the liquid glass backdrop so the toolbar glass refracts the blur. Values are
// React Bits' "Peek" preset; tint #120f17 at 0.15.
const EDGE_BLUR: GradualBlurProps = {
  strength: 1,
  layers: 5,
  curve: "ease-in",
  tint: "rgba(18, 15, 23, 0.15)",
  zIndex: 1,
  className: "library-edge-blur",
};

// The stage covers the frame under the toolbar; with liquid glass it is also
// the canvas that draws the toolbar's glass over the cards. The scroller is
// placed absolutely so it lands in the same spot either way.
export function LibraryStage({
  scrollRef,
  glassTargets,
  items,
  listMode,
  columnCount,
  context,
  hasPinnedQuery,
  emptySpaceName,
  onClearSearch,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  glassTargets: RefObject<HTMLElement | null>[];
  items: LibraryItem[];
  listMode: boolean;
  columnCount: number;
  context: LibraryCardContext;
  hasPinnedQuery: boolean;
  /** Set when an empty regular Space is open, which has no search to clear. */
  emptySpaceName?: string;
  onClearSearch: () => void;
}) {
  // VirtuosoMasonry keys rows by position, so a new result set must remount
  // the grid. Otherwise card state sticks to the wrong item after a filter change.
  const gridKey = useMemo(() => items.map((item) => String(item.id)).join("|"), [items]);

  return (
    // The canvas is sized to the window, not the stage: resizing a WebGPU canvas
    // stalls the GPU for tens of milliseconds, and the stage resizes every frame
    // of a sidebar slide. The extra edge is clipped.
    <LiquidGlass
      className="absolute inset-0 z-0 overflow-hidden [&_.liquid-glass-canvas]:h-screen [&_.liquid-glass-canvas]:w-screen [&_.liquid-glass-content]:bg-(--stage-background)"
      targetRoots={glassTargets}
    >
      {/* Reaches past the toolbar and bottom padding, nearly to the frame's
          edges, where the edge blur fades the cards out. The grid's padding
          puts the rows back where they rest. scripts/bench-library-grid.mjs
          measures `library-scroll`. */}
      <div
        className="library-scroll absolute top-[calc(var(--library-top)-var(--scroll-reach-top))] right-(--main-pad-x) bottom-[calc(var(--main-pad-bottom)-var(--scroll-reach-bottom))] left-(--main-pad-x) overflow-hidden [scrollbar-width:none] [--scroll-reach-bottom:20px] [--scroll-reach-top:12px] [&::-webkit-scrollbar]:hidden"
        ref={scrollRef}
      >
        {items.length > 0 ? (
          <VirtuosoMasonry
            key={gridKey}
            className={cx(
              "library-grid min-h-full min-w-0 pb-[calc(var(--scroll-reach-bottom)+36px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              // Paper 1.3: a pinned query's filter row puts the first card
              // 100px below the toolbar's top.
              hasPinnedQuery
                ? "pt-[calc(var(--scroll-reach-top)+100px)]"
                : "pt-(--scroll-reach-top)",
              listMode ? "list-mode gap-0" : "gap-3",
            )}
            columnCount={listMode ? 1 : columnCount}
            data={items}
            context={context}
            ItemContent={LibraryCard}
            style={{ height: "100%", width: "100%" }}
          />
        ) : (
          <div className="mt-24 rounded-sidebar border border-dashed border-border px-5 py-20 text-center">
            <div className="mx-auto mt-0 mb-(--spacing-component) grid size-[42px] place-items-center rounded-full bg-surface text-muted">
              <HugeiconsIcon icon={Search01Icon} size={20} />
            </div>
            <h2 className="m-0 font-quote text-[24px] leading-[normal] font-normal tracking-[-0.04em]">
              {emptySpaceName ? `${emptySpaceName} is empty.` : "Nothing surfaced yet."}
            </h2>
            <p className="mx-0 mt-[9px] mb-[17px] text-[13px] text-muted">
              {emptySpaceName
                ? `Open anything in your library and pick ${emptySpaceName} to file it in here.`
                : "Try another word, or save something new to your mind."}
            </p>
            {!emptySpaceName && (
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-[13px] text-accent underline underline-offset-3"
                onClick={onClearSearch}
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
      {items.length > 0 && (
        <>
          <GradualBlur {...EDGE_BLUR} position="top" />
          <GradualBlur {...EDGE_BLUR} position="bottom" />
        </>
      )}
    </LiquidGlass>
  );
}
