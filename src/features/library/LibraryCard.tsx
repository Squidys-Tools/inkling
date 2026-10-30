/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- Library cards contain nested controls and media, so the article cannot become a button; Enter and Space select the focused card. */
import {
  AlertCircleIcon,
  ArrowUpRight01Icon,
  Loading01Icon,
  PlayIcon,
  RotateCwIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { KindIcon, mediaAspectRatioFor } from "../../components/ItemMedia";
import { cardRects, type SourceRects } from "../item-view/overlayMotion";
import type { ReaderOrigin } from "../../ReaderView";
import type { LibraryItem } from "../../lib/types";
import { RETRY_BUTTON } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { ArchiveTileControls } from "./ArchiveTileControls";
import {
  CardMedia,
  cardKindOf,
  mediaKindOf,
  quoteAttribution,
  type CardKind,
  type CardLayout,
  type MediaKind,
} from "./LibraryCardMedia";

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

function cardShape(layout: CardLayout, kind: CardKind): string {
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

function mediaBox(layout: CardLayout, kind: CardKind, media: MediaKind): string {
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
  // A grid article is the one grid card that shows its text, over a strip.
  const gridArticle = layout === "grid" && kind === "article";
  const showText = list || gridArticle;
  const isQuote = item.kind === "Quote";
  const isArchiveTile = Boolean(context.onDeleteArchivedItem);
  const archiveSelectionMode = context.archiveSelectionMode === true;
  const isArchivedItemSelected = context.isArchivedItemSelected?.(item) ?? false;
  const canOpenReader = Boolean(item.articleHtml || item.hasArticleContent);
  const handleCardSelect = (event: React.MouseEvent<HTMLElement>) => {
    if (archiveSelectionMode) {
      event.preventDefault();
      context.onToggleArchivedItem?.(item);
      return;
    }
    context.onSelectItem(item, cardRects(event.currentTarget));
  };
  const textColor = item.featured
    ? "text-muted"
    : kind === "article"
      ? "text-[#7a7268]"
      : kind === "note"
        ? "text-[#9fb1ae]"
        : "text-muted";
  const kickerColor = item.featured
    ? "text-muted"
    : kind === "article"
      ? "text-[#7a7268]"
      : kind === "note"
        ? "text-[#9fb9b7]"
        : kind === "quote"
          ? "text-[#b3ad8d]"
          : "text-muted";

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
        <div
          className={cx(
            !showText && "hidden",
            gridArticle
              ? "flex min-h-0 flex-[1_1_auto] flex-col justify-between p-4"
              : "pt-[17px] px-[18px] pb-(--spacing-component)",
            list && "flex min-h-0 flex-col after:order-1 after:flex-[1_0_14px] after:content-['']",
            (isQuote || item.featured) && "bg-surface",
            isQuote && "border-t border-[rgba(255,255,255,0.04)]",
          )}
        >
          <div
            className={cx(
              "flex items-center justify-between gap-3 font-mono text-[10px]/[1.2] tracking-[0.08em] uppercase",
              kickerColor,
              gridArticle && "hidden",
            )}
          >
            <span className="flex items-center gap-1.5">
              <KindIcon kind={item.kind} />
              {item.kind}
            </span>
            <span>{item.date}</span>
          </div>
          <h2
            className={cx(
              gridArticle ? "m-0" : "mx-0 mt-[13px] mb-[7px]",
              isQuote
                ? "font-sans text-[16px]/[1.28] font-normal tracking-[-0.01em]"
                : kind === "article"
                  ? "font-body text-[16px]/[1.3] font-semibold tracking-[-0.01em]"
                  : cx(
                      "font-sans leading-[1.22] font-semibold",
                      kind === "note"
                        ? "text-[19px] tracking-[-0.025em]"
                        : item.featured
                          ? "text-[22px] tracking-[-0.02em]"
                          : "text-[17px] tracking-[-0.02em]",
                    ),
              kind === "article" ? "text-[#1a1714]" : item.featured && "text-ink",
            )}
          >
            {isQuote
              ? /^["“]/u.test(item.title.trim())
                ? item.title
                : `“${item.title}”`
              : item.title}
          </h2>
          <p
            className={cx(
              "m-0 max-w-[56ch]",
              isQuote
                ? cx("font-mono text-[10px]/[1.45] text-muted", list ? "min-h-[37px]" : "min-h-0")
                : cx("font-sans text-[12px]/[1.52]", textColor, list ? "min-h-0" : "min-h-[37px]"),
              gridArticle && "hidden",
            )}
          >
            {isQuote ? quoteAttribution(item.description) : item.description}
          </p>
          {item.processing?.active && (
            <div
              className={cx(
                "mt-[13px] flex items-center gap-[7px] font-body text-[10px]/[1.35] text-green [&_svg]:animate-[spin_1.2s_linear_infinite] [&>span:nth-child(3)]:ml-auto [&>span:nth-child(3)]:text-muted",
                gridArticle && "hidden",
              )}
              role="status"
            >
              <HugeiconsIcon icon={Loading01Icon} size={13} />
              <span>{item.processing.message ?? "Processing"}</span>
              {item.processing.progressTotal != null && (
                <span>
                  {item.processing.progressCurrent}/{item.processing.progressTotal}
                </span>
              )}
            </div>
          )}
          {item.processing?.failedJob && (
            <div
              className={cx(
                "mt-[13px] flex items-start gap-[7px] font-body text-[10px]/[1.35] text-[#d07055] [&_svg]:animate-[spin_1.2s_linear_infinite] [&>span:nth-child(3)]:ml-auto [&>span:nth-child(3)]:text-muted",
                gridArticle && "hidden",
              )}
              role="alert"
            >
              <HugeiconsIcon icon={AlertCircleIcon} size={13} />
              <span>{item.processing.failedJob.errorMessage ?? "Processing failed"}</span>
              <button
                type="button"
                className={RETRY_BUTTON}
                onClick={(event) => {
                  event.stopPropagation();
                  void context.onRetryJob(item.processing?.failedJob?.id ?? "");
                }}
              >
                <HugeiconsIcon icon={RotateCwIcon} size={12} /> Try again
              </button>
            </div>
          )}
          <div
            className={cx(
              "flex items-center justify-between gap-2.5 text-muted",
              gridArticle
                ? "mt-0 pt-0"
                : cx(
                    "border-t pt-[11px]",
                    list ? "order-2 mt-0" : "mt-[18px]",
                    kind === "article" ? "border-[rgba(26,23,20,0.12)]" : "border-border",
                  ),
            )}
          >
            <span
              className={cx(
                "overflow-hidden font-mono text-[11px]/[1.2] text-ellipsis whitespace-nowrap",
                kind === "article" && "text-[#7a7268]",
              )}
            >
              {item.readingMinutes ? `${item.source} · ${item.readingMinutes} min` : item.source}
            </span>
            {item.kind === "Article" && (
              <button
                type="button"
                className={CARD_ACTION}
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  context.onOpenReader(item, {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  });
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    context.onOpenReader(item);
                  }
                }}
                disabled={!canOpenReader}
                data-tooltip={canOpenReader ? "Open reader" : "No saved article text"}
              >
                Read <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
              </button>
            )}
            {item.kind === "Video" && item.video && (
              <button
                type="button"
                className={CARD_ACTION}
                onClick={(event) => {
                  event.stopPropagation();
                  const card = event.currentTarget.closest<HTMLElement>(".library-card");
                  context.onSelectItem(item, card ? cardRects(card) : undefined);
                }}
              >
                Watch <HugeiconsIcon icon={PlayIcon} size={11} />
              </button>
            )}
            {!(item.kind === "Article" || (item.kind === "Video" && item.video)) && (
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
            )}
          </div>
        </div>
      </article>
    </div>
  );
});

const CARD_ACTION =
  "inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-transparent px-[9px] py-1 font-body text-[10px] leading-[normal] font-medium tracking-[0.02em] text-muted transition-[color,border-color,background-color] duration-150 ease-[ease] enabled:hover:border-[#4a4842] enabled:hover:bg-surface enabled:hover:text-ink disabled:cursor-default disabled:opacity-45";
