/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- Library cards contain nested controls and media, so the article cannot become a button; Enter and Space select the focused card. */
import { memo } from "react";
import { mediaAspectRatioFor } from "../../components/ItemMedia";
import { cardRects, type SourceRects } from "../item-view/overlayMotion";
import type { ReaderOrigin } from "../reader/ReaderView";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import { ArchiveTileControls } from "./ArchiveTileControls";
import {
  CardMedia,
  cardKindOf,
  mediaKindOf,
  type CardKind,
  type CardLayout,
  type MediaKind,
} from "./LibraryCardMedia";
import { LibraryCardText } from "./LibraryCardText";

export type LibraryCardContext = {
  layout: CardLayout;
  onSelectItem: (item: LibraryItem, rects?: SourceRects) => void;
  onOpenReader: (item: LibraryItem, origin?: ReaderOrigin) => void;
  onRetryJob: (jobId: string) => void | Promise<void>;
  onDeleteArchivedItem?: (item: LibraryItem) => void | Promise<void>;
  archiveSelectionMode?: boolean;
  isArchivedItemSelected?: (item: LibraryItem) => boolean;
  onToggleArchivedItem?: (item: LibraryItem) => void;
  onRestoreArchivedItem?: (item: LibraryItem) => void | Promise<void>;
  onOpenMenu?: (
    item: LibraryItem,
    event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
  ) => void;
};

const SELECTED_RING =
  "[&.is-selected]:after:pointer-events-none [&.is-selected]:after:absolute [&.is-selected]:after:inset-0 [&.is-selected]:after:z-5 [&.is-selected]:after:rounded-[inherit] [&.is-selected]:after:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_80%,transparent)]";

function cardShape(layout: CardLayout, kind: CardKind) {
  if (layout === "list") return "grid grid-cols-[155px_1fr] aspect-auto";
  if (layout === "archive") return "aspect-auto";
  switch (kind) {
    case "article":
      return "flex h-[250px] flex-col aspect-auto";
    case "quote":
      return "flex min-h-[250px] flex-col aspect-auto";
    case "note":
    case "pdf":
    case "file":
      return "h-[300px] aspect-auto";
    case "video":
      return "h-[190px] aspect-auto";
    default:
      return "aspect-[var(--card-media-ratio,4/3)]";
  }
}

function mediaBox(layout: CardLayout, kind: CardKind, media: MediaKind) {
  if (layout === "list") return "static inset-0 min-w-0";
  if (layout === "grid" && kind === "article")
    return media === "paper" ? "hidden" : "relative inset-auto h-[120px] min-w-0 flex-none";
  if (layout === "grid" && kind === "quote")
    return "relative inset-auto flex min-w-0 flex-[1_0_auto] flex-col";
  if (layout === "archive")
    return "relative inset-0 h-[132px] min-w-0 overflow-hidden rounded-[10px]";
  return "absolute inset-0 min-w-0";
}

export const LibraryCard = memo(function LibraryCard({
  data: item,
  index,
  context,
}: {
  data: LibraryItem;
  index: number;
  context: LibraryCardContext;
}) {
  const { layout } = context;
  const list = layout === "list";
  const kind = cardKindOf(item);
  const media = mediaKindOf(item);
  const isArchiveTile = Boolean(context.onDeleteArchivedItem);
  const archiveSelectionMode = context.archiveSelectionMode === true;
  const isArchivedItemSelected = context.isArchivedItemSelected?.(item) ?? false;
  const handleCardSelect = (event: React.MouseEvent<HTMLElement>) => {
    if (archiveSelectionMode) {
      event.preventDefault();
      context.onToggleArchivedItem?.(item);
      return;
    }
    context.onSelectItem(item, cardRects(event.currentTarget));
  };

  return (
    <div
      className={cx("box-border min-w-0", list ? "pb-[9px]" : "pb-3")}
      data-library-index={index}
    >
      <article
        className={cx(
          "library-card relative w-full min-w-0 origin-top-left cursor-pointer",
          "transition-[translate,box-shadow] duration-200 ease-[ease]",
          "in-data-entering:opacity-0",
          SELECTED_RING,
          cardShape(layout, kind),
          kind === "article" ? "text-[#1a1714]" : undefined,
          isArchiveTile
            ? // index.css's unlayered focus ring outranks a plain utility; the
              // tile rings its media instead.
              "group/tile overflow-visible bg-transparent focus-visible:outline-none!"
            : cx(
                "overflow-hidden rounded-card contain-[layout_paint] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.4)] focus-visible:-translate-y-0.5",
                kind === "article" && !(list && item.featured) ? "bg-[#ece6dc]" : "bg-surface",
              ),
        )}
        data-library-item-id={String(item.id)}
        style={{ "--card-media-ratio": String(mediaAspectRatioFor(item)) } as React.CSSProperties}
        onClick={handleCardSelect}
        onContextMenu={
          context.onOpenMenu && !archiveSelectionMode
            ? (event) => context.onOpenMenu?.(item, event)
            : undefined
        }
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (
            context.onOpenMenu &&
            !archiveSelectionMode &&
            (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
          ) {
            event.preventDefault();
            context.onOpenMenu(item, event);
            return;
          }
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (archiveSelectionMode) {
            context.onToggleArchivedItem?.(item);
          } else {
            context.onSelectItem(item, cardRects(event.currentTarget));
          }
        }}
      >
        <div
          className={cx(
            "library-card-media",
            mediaBox(layout, kind, media),
            isArchiveTile &&
              (isArchivedItemSelected
                ? "outline-2 outline-offset-2 outline-accent"
                : "group-hover/tile:outline-2 group-hover/tile:outline-offset-2 group-hover/tile:outline-ink group-focus-visible/tile:outline-2 group-focus-visible/tile:outline-offset-2 group-focus-visible/tile:outline-ink"),
          )}
        >
          <CardMedia item={item} index={index} layout={layout} kind={kind} media={media} />
          {isArchiveTile && (
            <ArchiveTileControls
              item={item}
              context={context}
              isArchivedItemSelected={isArchivedItemSelected}
            />
          )}
        </div>
        {isArchiveTile && (
          <div className="mt-[9px] flex min-w-0 flex-col gap-0.5">
            <span className="overflow-hidden font-body text-[13px]/[17px] font-normal text-ellipsis whitespace-nowrap text-ink">
              {item.title}
            </span>
            <span className="overflow-hidden font-mono text-[11px]/[14px] font-normal text-ellipsis whitespace-nowrap text-[#6f685f]">
              {item.kind} · {item.date}
            </span>
          </div>
        )}
        <LibraryCardText item={item} kind={kind} context={context} />
      </article>
    </div>
  );
});
