import { useEffect, useState } from "react";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import { ItemTitle } from "./ItemTitle";

// Similar tiles sit in two columns. An image's height follows its shape, clamped
// to the range Paper uses; the other tiles have fixed heights.
const SIMILAR_TILE_WIDTH = 139;
const SIMILAR_TILE_GAP = 8;

const TILE =
  "flex w-full cursor-pointer flex-col justify-between gap-1.5 overflow-hidden text-left";
const TEXT_TILE = cx(
  TILE,
  "rounded-tile border border-border p-3.5 text-ink hover:border-[#3a3531]",
);
const SMALL_CAPS = "font-mono text-[9px]/3 text-muted uppercase";

function similarTileHeight(item: LibraryItem): number {
  if (item.image) {
    const ratio = item.mediaWidth && item.mediaHeight ? item.mediaHeight / item.mediaWidth : 1.25;
    return Math.round(Math.min(200, Math.max(100, SIMILAR_TILE_WIDTH * ratio)));
  }
  if (item.kind === "Quote") return 150;
  if (item.kind === "Note") return 170;
  return 120;
}

// Each tile goes to the shorter column, so the two columns end at similar heights.
function splitIntoColumns(items: LibraryItem[]): [LibraryItem[], LibraryItem[]] {
  const columns: [LibraryItem[], LibraryItem[]] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const shorter = heights[0] <= heights[1] ? 0 : 1;
    columns[shorter].push(item);
    heights[shorter] += similarTileHeight(item) + SIMILAR_TILE_GAP;
  }
  return columns;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function SimilarTile({ item, onOpen }: { item: LibraryItem; onOpen: (item: LibraryItem) => void }) {
  const style = { height: similarTileHeight(item) };
  const open = () => onOpen(item);

  if (item.image) {
    return (
      <button
        type="button"
        className={cx(TILE, "rounded-tile border-0 bg-transparent p-0")}
        style={style}
        aria-label={item.title}
        onClick={open}
      >
        <img
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="block size-full object-cover"
        />
      </button>
    );
  }

  if (item.kind === "Quote") {
    const attribution = item.description.replace(/^—\s*/u, "");
    return (
      <button
        type="button"
        className={cx(TEXT_TILE, "bg-surface text-[#d0c68f]")}
        style={style}
        aria-label={item.title}
        onClick={open}
      >
        <span className="font-[Georgia,serif] text-[26px]/5 text-[#c4ba8c]" aria-hidden="true">
          “
        </span>
        <span className="line-clamp-6 font-sans text-[12px]/[17px]">{item.title}</span>
        {attribution ? (
          <span className="text-right font-mono text-[9px]/3 text-[#b3ad8d]">{attribution}</span>
        ) : null}
      </button>
    );
  }

  if (item.kind === "Note") {
    return (
      <button
        type="button"
        className={cx(TEXT_TILE, "bg-[#121110]")}
        style={style}
        aria-label={item.title}
        onClick={open}
      >
        <span className={cx(SMALL_CAPS, "tracking-[0.08em]")}>Note</span>
        <span className="font-sans text-[14px]/4 font-bold tracking-[-0.02em] text-ink uppercase wrap-anywhere">
          {item.title}
        </span>
        <span className={cx(SMALL_CAPS, "text-right")}>
          {wordCount(item.noteBody ?? item.description)} words
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cx(TEXT_TILE, "bg-surface")}
      style={style}
      aria-label={item.title}
      onClick={open}
    >
      <span className={cx(SMALL_CAPS, "tracking-[0.08em]")}>{item.kind}</span>
      <span className="font-sans text-[12px]/[17px] text-ink-soft wrap-anywhere">{item.title}</span>
    </button>
  );
}

export function SimilarPanel({
  item,
  similar,
  onOpen,
}: {
  item: LibraryItem;
  /** null while the lookup for this item is still running. */
  similar: LibraryItem[] | null;
  onOpen: (item: LibraryItem) => void;
}) {
  const [left, right] = splitIntoColumns(similar ?? []);
  return (
    <>
      <ItemTitle item={item} compact />
      {similar?.length === 0 && (
        <p className="m-0 text-[13px]/5 text-muted">Nothing similar yet.</p>
      )}
      {similar && similar.length > 0 && (
        <div className="flex items-start gap-2">
          {[left, right].map((column, index) => (
            <div
              // oxlint-disable-next-line react/no-array-index-key -- The two columns are fixed positions.
              key={index}
              className="flex min-w-0 flex-[0_0_139px] flex-col gap-2"
            >
              {column.map((tile) => (
                <SimilarTile key={String(tile.id)} item={tile} onOpen={onOpen} />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Looks up similar items while the Similar tab is open. Reloads only when the
// shown item changes, not on every edit to its record.
export function useSimilarItems(
  item: LibraryItem,
  open: boolean,
  load: (item: LibraryItem) => Promise<LibraryItem[]>,
) {
  // Tied to the item's id so a stale list never shows for another item.
  const [similar, setSimilar] = useState<{ itemId: string; items: LibraryItem[] } | null>(null);
  useEffect(() => {
    if (!open) return;
    const itemId = String(item.id);
    let cancelled = false;
    load(item).then(
      (items) => {
        if (!cancelled)
          setSimilar({
            itemId,
            items: items.filter((candidate) => String(candidate.id) !== itemId),
          });
      },
      () => {
        if (!cancelled) setSimilar({ itemId, items: [] });
      },
    );
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Keyed on the item ID; the lookup reads the item it was started for.
  }, [open, item.id]);
  return similar?.itemId === String(item.id) ? similar.items : null;
}
