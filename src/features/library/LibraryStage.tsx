import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { type RefObject, useMemo } from "react";
import { LiquidGlass } from "../../components/LiquidGlass";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import { LibraryCard, type LibraryCardContext } from "./LibraryCard";
import { LibraryEdgeFade } from "./LibraryEdgeFade";

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
    <LiquidGlass
      className="library-stage absolute inset-0 z-0 overflow-hidden"
      targetRoots={glassTargets}
    >
      {/* Reaches past the toolbar and bottom padding, nearly to the frame's
          edges, where LibraryEdgeFade blurs the cards out. The grid's padding
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
              <button type="button" className="text-button" onClick={onClearSearch}>
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
      {items.length > 0 && <LibraryEdgeFade />}
    </LiquidGlass>
  );
}
