// biome-ignore-all lint/a11y/noNoninteractiveTabindex: Library cards contain nested controls and media, so the article cannot become a button; Enter and Space select the focused card.
import {
  AlertCircleIcon,
  ArrowUpRight01Icon,
  CircleCheckIcon,
  CircleIcon,
  Delete02Icon,
  Loading01Icon,
  PlayIcon,
  RotateCwIcon,
  RotateLeft01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { canvasImageCrossOrigin } from "../../components/LiquidGlass";
import {
  FileArtwork,
  formatDuration,
  KindIcon,
  mediaAspectRatioFor,
  NoteArtwork,
  PdfArtwork,
  PostArtwork,
  QuoteArtwork,
} from "../../components/ItemMedia";
import type { SourceRects } from "../../components/overlayMotion";
import type { ReaderOrigin } from "../../ReaderView";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";

// Archive tiles reuse this markup; App.css still resets them to bare tiles
// through the `library-card` hooks until Settings moves (SQU-130).
type CardLayout = "grid" | "list" | "archive";

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
  onOpenMenu?: (item: LibraryItem, event: React.MouseEvent<HTMLElement>) => void;
};

// Each type gets its own treatment. Posts, images and videos with no artwork
// fall back to the typed file layout.
type CardKind = "note" | "quote" | "pdf" | "article" | "video" | "file" | "media";

function cardKindOf(item: LibraryItem): CardKind {
  switch (item.kind) {
    case "Note":
      return "note";
    case "Quote":
      return "quote";
    case "PDF":
      return "pdf";
    case "Article":
      return "article";
    case "Video":
      return item.image ? "video" : "file";
    case "File":
      return "file";
    default:
      return !item.image && !item.post ? "file" : "media";
  }
}

type MediaKind = "x-post" | "video" | "image" | "post" | "paper";

function mediaKindOf(item: LibraryItem): MediaKind {
  if (item.social?.provider === "x" && item.post) return "x-post";
  if (item.kind === "Video" && item.image) return "video";
  if (item.image) return "image";
  if (item.kind === "Post" && item.post) return "post";
  return "paper";
}

const SELECTED_RING =
  "[&.is-selected]:after:pointer-events-none [&.is-selected]:after:absolute [&.is-selected]:after:inset-0 [&.is-selected]:after:z-5 [&.is-selected]:after:rounded-[inherit] [&.is-selected]:after:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_80%,transparent)]";

// Media fills the card in the grid; in a list row it sits in the 155px column
// and grows with the text.
const MEDIA_FILL =
  "pointer-events-none absolute inset-0 size-full min-h-0 aspect-auto object-cover";
const MEDIA_ROW = "pointer-events-none relative inset-auto h-full w-auto aspect-auto object-cover";

function cardShape(layout: CardLayout, kind: CardKind): string {
  if (layout === "list") return "grid grid-cols-[155px_1fr] aspect-auto";
  if (layout === "archive") return "aspect-[4/5]";
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
  return "absolute inset-0 min-w-0";
}

function quoteAttribution(description: string): string {
  const text = description.trim();
  if (!text) return "";
  return text.startsWith("—") ? text : `— ${text}`;
}

// Quotes show in full on the card; the art clamps only very long ones.
function cardText(value: string | undefined, fallback: string): string {
  return value?.replace(/\s+/gu, " ").trim() || fallback;
}

// Captures the card and its media box before selection state changes, so the
// item view's opening flight starts from the card's exact position.
function cardRectsFor(card: HTMLElement): SourceRects {
  const cardRect = card.getBoundingClientRect();
  const mediaRect = card.querySelector<HTMLElement>(".library-card-media")?.getBoundingClientRect();
  return {
    card: {
      left: cardRect.left,
      top: cardRect.top,
      width: cardRect.width,
      height: cardRect.height,
    },
    media: mediaRect
      ? {
          left: mediaRect.left,
          top: mediaRect.top,
          width: mediaRect.width,
          height: mediaRect.height,
        }
      : { left: cardRect.left, top: cardRect.top, width: cardRect.width, height: 0 },
  };
}

// The pill is the only play affordance on a video card; playback happens in
// the item view, the only place a local video file is loaded.
function VideoPill({ item }: { item: LibraryItem }) {
  return (
    <span
      className="glass pointer-events-none absolute bottom-2.5 left-2.5 z-1 inline-flex items-center gap-1.5 rounded-full py-[5px] pr-2.5 pl-2 font-mono text-[11px]/[14px] text-ink"
      aria-hidden="true"
    >
      <HugeiconsIcon icon={PlayIcon} size={10} />
      {item.durationSeconds !== undefined && <span>{formatDuration(item.durationSeconds)}</span>}
    </span>
  );
}

function CardMedia({
  item,
  index,
  layout,
  kind,
  media,
}: {
  item: LibraryItem;
  index: number;
  layout: CardLayout;
  kind: CardKind;
  media: MediaKind;
}) {
  const list = layout === "list";
  if (media === "x-post")
    return (
      <div
        className={cx(
          "overflow-hidden bg-white",
          list ? cx(MEDIA_ROW, "min-h-[155px]") : MEDIA_FILL,
        )}
      >
        <PostArtwork
          post={item.post as NonNullable<LibraryItem["post"]>}
          className={cx(
            "size-full min-h-0",
            list ? "static inset-auto aspect-auto" : "aspect-(--card-media-ratio)",
          )}
        />
      </div>
    );
  if (media === "post")
    return (
      <PostArtwork
        post={item.post as NonNullable<LibraryItem["post"]>}
        className={
          list
            ? "pointer-events-none static inset-auto h-full min-h-[155px] w-auto aspect-auto object-cover"
            : "pointer-events-none absolute inset-0 size-full min-h-0 aspect-(--card-media-ratio) object-cover"
        }
      />
    );
  if (media === "image" || media === "video")
    return (
      <div
        className={cx(
          "overflow-hidden bg-surface-raised",
          list ? cx(MEDIA_ROW, "min-h-[120px]") : MEDIA_FILL,
        )}
      >
        <img
          src={item.image}
          crossOrigin={canvasImageCrossOrigin(item.image)}
          alt={item.imageAlt ?? item.title}
          className={cx("block size-full object-cover", list && "absolute inset-0")}
          loading="lazy"
          decoding="async"
          fetchPriority={index < 6 ? "high" : undefined}
        />
        {media === "video" && <VideoPill item={item} />}
      </div>
    );

  const place = list ? cx(MEDIA_ROW, "min-h-[155px]") : MEDIA_FILL;
  if (item.kind === "Quote")
    return (
      <QuoteArtwork
        text={cardText(item.title, "Saved quote")}
        attribution={quoteAttribution(item.description)}
        compact={list}
        className={cx(
          list
            ? cx(place, "flex flex-col px-4 py-[14px]")
            : layout === "grid"
              ? "pointer-events-none relative inset-auto flex h-auto min-h-0 w-full flex-[1_0_auto] flex-col pt-[22px] pr-[30px] pb-10 pl-[26px] aspect-auto object-cover"
              : place,
        )}
      />
    );
  return (
    <div
      className={cx(
        "overflow-hidden",
        place,
        kind === "article"
          ? "bg-transparent"
          : item.featured
            ? "bg-accent-soft"
            : cx("bg-surface", item.accent),
      )}
      aria-hidden={item.kind !== "Article" || !item.sourceUrl}
    >
      {item.kind === "Article" && (
        <>
          <span className="absolute top-[36%] left-[11%] block h-px w-1/2 bg-[#4a4842] opacity-65" />
          <span className="absolute top-[45%] left-[11%] block h-px w-[31%] bg-[#4a4842] opacity-65" />
          <span className="absolute right-[12%] bottom-[15%] grid size-[58px] place-items-center rounded-full border border-[#a06b4e] font-body text-[26px] leading-[normal] text-[#d98d68] [transform:rotate(-13deg)]">
            m
          </span>
          {item.sourceUrl && (
            <span
              className={cx(
                "pointer-events-none absolute right-[36%] bottom-[12%] left-[11%] grid gap-1 text-ink",
                list && "hidden",
              )}
            >
              <span className="line-clamp-2 font-body text-[12px]/[1.2] font-medium tracking-[-0.02em]">
                {item.title}
              </span>
              <span className="overflow-hidden font-mono text-[10px]/[1.2] text-ellipsis whitespace-nowrap text-muted">
                {item.source}
              </span>
            </span>
          )}
        </>
      )}
      {item.kind === "Note" && <NoteArtwork item={item} compact={list} />}
      {item.kind === "PDF" && <PdfArtwork item={item} compact={list} />}
      {(item.kind === "File" ||
        item.kind === "Post" ||
        item.kind === "Image" ||
        item.kind === "Video") && <FileArtwork item={item} compact={list} />}
    </div>
  );
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
    context.onSelectItem(item, cardRectsFor(event.currentTarget));
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
          "library-card relative w-full min-w-0 origin-top-left cursor-pointer overflow-hidden rounded-card contain-[layout_paint]",
          "transition-[translate,box-shadow] duration-200 ease-[ease] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.4)] focus-visible:-translate-y-0.5",
          "in-data-entering:opacity-0",
          SELECTED_RING,
          cardShape(layout, kind),
          kind === "article" ? "text-[#1a1714]" : undefined,
          kind === "article" && !(list && item.featured) ? "bg-[#ece6dc]" : "bg-surface",
          archiveSelectionMode && "archive-selection-mode",
          isArchivedItemSelected && "archive-card-selected",
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
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (archiveSelectionMode) {
            context.onToggleArchivedItem?.(item);
          } else {
            context.onSelectItem(item, cardRectsFor(event.currentTarget));
          }
        }}
      >
        <div className={cx("library-card-media", mediaBox(layout, kind, media))}>
          <CardMedia item={item} index={index} layout={layout} kind={kind} media={media} />
          {isArchiveTile && (
            <div className="archive-tile-actions">
              {!archiveSelectionMode && (
                <button
                  type="button"
                  className="archive-tile-restore"
                  data-tooltip="Restore to library"
                  onClick={(event) => {
                    event.stopPropagation();
                    void context.onRestoreArchivedItem?.(item);
                  }}
                >
                  <HugeiconsIcon icon={RotateLeft01Icon} size={12} />
                  Restore
                </button>
              )}
              <button
                type="button"
                className={`archive-card-delete ${archiveSelectionMode ? "archive-card-select" : ""} ${isArchivedItemSelected ? "is-selected" : ""}`}
                aria-label={
                  archiveSelectionMode
                    ? `${isArchivedItemSelected ? "Deselect" : "Select"} ${item.title}`
                    : `Delete ${item.title}`
                }
                aria-pressed={archiveSelectionMode ? isArchivedItemSelected : undefined}
                data-tooltip={
                  archiveSelectionMode
                    ? isArchivedItemSelected
                      ? "Deselect item"
                      : "Select item"
                    : "Delete permanently"
                }
                onClick={(event) => {
                  event.stopPropagation();
                  if (archiveSelectionMode) {
                    context.onToggleArchivedItem?.(item);
                  } else {
                    void context.onDeleteArchivedItem?.(item);
                  }
                }}
              >
                <HugeiconsIcon
                  icon={
                    archiveSelectionMode
                      ? isArchivedItemSelected
                        ? CircleCheckIcon
                        : CircleIcon
                      : Delete02Icon
                  }
                  size={archiveSelectionMode ? 18 : 13}
                />
              </button>
            </div>
          )}
        </div>
        {isArchiveTile && (
          <div className="archive-tile-caption">
            <span className="archive-tile-title">{item.title}</span>
            <span className="archive-tile-meta">
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
                className="retry-button"
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
                  context.onSelectItem(item, card ? cardRectsFor(card) : undefined);
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
