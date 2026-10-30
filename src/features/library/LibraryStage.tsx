import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { type RefObject, useMemo, useRef, useLayoutEffect } from "react";
import GradualBlur, { type GradualBlurProps } from "../../components/GradualBlur/GradualBlur";
import { LiquidGlass } from "../../components/LiquidGlass";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import { LibraryCard, type LibraryCardContext } from "./LibraryCard";
import { useLibraryViewport } from "./useLibraryViewport";
import { markResultCard, ResultMotion } from "./ResultMotion";

type ResultItem = { item: LibraryItem; revision: string };
function KeyedCard({
  data,
  index,
  context,
}: {
  data: ResultItem | undefined;
  index: number;
  context: LibraryCardContext;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const revision = data?.revision;
  useLayoutEffect(() => {
    if (ref.current && revision !== undefined) return markResultCard(ref.current, revision);
  }, [revision]);
  // Masonry may publish a retained positional wrapper while its data changes.
  // Keep hooks unconditional and never let that transient unmount the app root.
  if (!data) return null;
  return (
    <div ref={ref} data-result-card="">
      <LibraryCard key={data.item.id} data={data.item} index={index} context={context} />
    </div>
  );
}

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
  useLibraryViewport(scrollRef, chromeRef, dockRef);
  const ids = useMemo(() => items.map((item) => String(item.id)), [items]);
  const revision = useMemo(() => JSON.stringify(ids), [ids]);
  const data = useMemo(() => items.map((item) => ({ item, revision })), [items, revision]);

  return (
    <ResultMotion rootRef={scrollRef} revision={revision} ids={ids} listMode={listMode}>
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
              key={`${listMode}:${revision}`}
              className={cx(
                "library-grid min-h-full min-w-0 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                listMode ? "list-mode gap-0" : "gap-3",
              )}
              columnCount={listMode ? 1 : columnCount}
              data={data}
              context={context}
              ItemContent={KeyedCard}
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
        {items.length > 0 && (
          <>
            <GradualBlur {...EDGE_BLUR} position="top" />
            <GradualBlur {...EDGE_BLUR} position="bottom" />
          </>
        )}
      </LiquidGlass>
    </ResultMotion>
  );
}
