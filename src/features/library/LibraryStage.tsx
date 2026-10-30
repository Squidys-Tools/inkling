import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { type RefObject, useMemo } from "react";
import { LiquidGlass } from "../../components/LiquidGlass";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import { LibraryCard, type LibraryCardContext } from "./LibraryCard";
import { LibraryEdgeFade } from "./LibraryEdgeFade";
import { useLibraryViewport } from "./useLibraryViewport";

export function LibraryStage({
  scrollRef,
  glassTargets,
  items,
  listMode,
  columnCount,
  context,
  chromeRef,
  dockRef,
  emptySpaceName,
  onClearSearch,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  glassTargets: RefObject<HTMLElement | null>[];
  items: LibraryItem[];
  listMode: boolean;
  columnCount: number;
  context: LibraryCardContext;
  chromeRef: RefObject<HTMLElement | null>;
  dockRef: RefObject<HTMLDivElement | null>;
  emptySpaceName?: string;
  onClearSearch: () => void;
}) {
  // Preserve upstream's membership-keyed virtualizer; viewport measurement
  // does not require the separate enhanced-search/motion implementation.
  const gridKey = useMemo(() => items.map((item) => String(item.id)).join("|"), [items]);
  useLibraryViewport(scrollRef, chromeRef, dockRef);

  return (
    <LiquidGlass
      className="absolute inset-0 z-0 overflow-hidden [&_.liquid-glass-canvas]:h-screen [&_.liquid-glass-canvas]:w-screen [&_.liquid-glass-content]:bg-(--stage-background)"
      targetRoots={glassTargets}
    >
      <div
        className="library-scroll absolute top-(--library-top) right-(--main-pad-x) bottom-16 left-(--main-pad-x) overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={scrollRef}
      >
        {items.length > 0 ? (
          <VirtuosoMasonry
            key={gridKey}
            className={cx(
              "library-grid min-h-full min-w-0 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              listMode ? "list-mode gap-0" : "gap-3",
            )}
            columnCount={listMode ? 1 : columnCount}
            data={items}
            context={context}
            ItemContent={LibraryCard}
            style={{ height: "100%", width: "100%" }}
          />
        ) : (
          <div className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-h-full flex-col items-center justify-center rounded-sidebar border border-dashed border-border px-5 py-6 text-center">
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
          </div>
        )}
      </div>
      {items.length > 0 && <LibraryEdgeFade />}
    </LiquidGlass>
  );
}
