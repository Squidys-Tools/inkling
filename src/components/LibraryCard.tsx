import { memo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  ArrowUpRight01Icon,
  CircleCheckIcon,
  CircleIcon,
  Delete02Icon,
  Loading01Icon,
  PlayIcon,
  RotateCwIcon,
} from "@hugeicons/core-free-icons";
import { providerLabel } from "../lib/ingestion/video-links";
import type { LibraryItem } from "../App";
import type { ReaderOrigin } from "../ReaderView";
import {
  KindIcon,
  NoteArtwork,
  POST_ART_CLASS,
  PdfArtwork,
  PostArtwork,
  XPostEmbed,
  mediaAspectRatioFor,
} from "./ItemMedia";
import type { SourceRects } from "./overlayMotion";

/* The `card-image-wrap` / `card-paper-art` hooks are read as direct children of
   `.library-card-media` by the grid-to-detail FLIP transition, so they stay
   verbatim. The featured tint uses an ancestor variant because the accent class
   on the paper (`paper-blue` and friends) must keep losing to it. */
const CARD_PAPER_ART_CLASS =
  "card-paper-art relative aspect-[var(--card-media-ratio,1.45)] overflow-hidden bg-surface [.featured-card_&]:bg-orange-soft";

const CARD_IMAGE_WRAP_CLASS =
  "card-image-wrap relative aspect-[var(--card-media-ratio,4/3)] overflow-hidden bg-surface-strong";

const CARD_IMAGE_CLASS = "card-image block h-full w-full object-cover transition-none";

const PAPER_LINE_CLASS = "paper-line absolute block h-px bg-[#4a4842] opacity-65";

const PAPER_SEAL_CLASS =
  "paper-seal absolute right-[12%] bottom-[15%] grid size-[58px] place-items-center rounded-full border border-[#a06b4e] " +
  "font-sans text-[26px] text-[#d98d68] [transform:rotate(-13deg)]";

function LibraryVideoMedia({ item, index }: { item: LibraryItem; index: number }) {
  if (!item.video && !item.fileUrl && !item.image) {
    return <div className={CARD_PAPER_ART_CLASS} aria-hidden="true"><span className="video-paper-play"><HugeiconsIcon icon={PlayIcon} size={20} /></span></div>;
  }

  // Cards are static thumbnails that open the details overlay on click. The
  // play badge is a purely visual affordance — playback happens in the overlay.
  return (
    <div className={CARD_IMAGE_WRAP_CLASS}>
      {item.image ? (
        <img src={item.image} alt={item.imageAlt ?? item.title} className={CARD_IMAGE_CLASS} loading="lazy" decoding="async" fetchPriority={index < 6 ? "high" : undefined} />
      ) : item.fileUrl ? (
        <video
          className={`${CARD_IMAGE_CLASS} bg-[#171817]`}
          src={item.fileUrl}
          muted
          playsInline
          preload="metadata"
          aria-label={item.title}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = 0.01;
          }}
        />
      ) : null}
      <span className="card-video-scrim" aria-hidden="true" />
      <span className="card-play" aria-hidden="true"><HugeiconsIcon icon={PlayIcon} size={16} /></span>
      <span className="card-video-badge">{item.video ? providerLabel(item.video.provider) : "Video"}</span>
    </div>
  );
}

function cardPreviewText(value: string | undefined, fallback: string): string {
  const text = value?.replace(/\s+/gu, " ").trim() || fallback;
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

export type LibraryCardContext = {
  onSelectItem: (item: LibraryItem, rects?: SourceRects) => void;
  onOpenReader: (item: LibraryItem, origin?: ReaderOrigin) => void;
  onRetryJob: (jobId: string) => void | Promise<void>;
  onDeleteArchivedItem?: (item: LibraryItem) => void | Promise<void>;
  archiveSelectionMode?: boolean;
  isArchivedItemSelected?: (item: LibraryItem) => boolean;
  onToggleArchivedItem?: (item: LibraryItem) => void;
};

// Captures the card and its media box before selection state changes, so the
// overlay's opening flight starts from the card's exact position.
export function cardRectsFor(card: HTMLElement): SourceRects {
  const cardRect = card.getBoundingClientRect();
  const mediaRect = card.querySelector<HTMLElement>(".library-card-media")?.getBoundingClientRect();
  return {
    card: { left: cardRect.left, top: cardRect.top, width: cardRect.width, height: cardRect.height },
    media: mediaRect
      ? { left: mediaRect.left, top: mediaRect.top, width: mediaRect.width, height: mediaRect.height }
      : { left: cardRect.left, top: cardRect.top, width: cardRect.width, height: 0 },
  };
}

/* `library-card` and `is-selected` are a behavioural API: the overlay, the FLIP
   transition and the keyboard selection path all look them up on the live DOM,
   `is-selected` included, which is toggled with `classList` on virtualized nodes
   instead of through React state. Hence the plain classes and the `&.is-selected`
   variant rather than a conditional class. */
const LIBRARY_CARD_CLASS =
  "library-card w-full min-w-0 cursor-pointer aspect-[4/5] overflow-hidden rounded-[20px] border border-rule bg-surface " +
  "contain-[layout_paint] origin-top-left transition-[translate,box-shadow,border-color] duration-[.2s] ease-[ease] " +
  "hover:translate-y-[-3px] hover:border-[#4a4842] hover:shadow-[0_11px_27px_rgba(0,0,0,.45)] focus-visible:translate-y-[-2px] " +
  "[&.is-selected]:border-[#595450] [&.is-selected]:shadow-[0_0_0_1px_rgba(239,117,64,.35)]";

const LIBRARY_CARD_SLOT_CLASS = "library-card-slot box-border min-w-0";

/* The grid reaches into cards from the outside: it measures the media box to
   start the overlay flight, clones the card for the view transition, and
   toggles `is-selected` with classList on virtualized nodes. These selectors
   and the classNames above are two halves of one contract, so they are
   declared together and imported by the grid rather than retyped there. */
export const CARD_MEDIA_SELECTOR = ".library-card-media";

const CARD_MEDIA_CHILD_CLASSES = [
  "card-image-wrap",
  "card-paper-art",
  "post-art",
  "x-post-art",
] as const;

export const CARD_MEDIA_CHILDREN_SELECTOR = CARD_MEDIA_CHILD_CLASSES
  .map((name) => `.library-card-media > .${name}`)
  .join(", ");

export const CARD_TRANSITION_TARGET_SELECTOR = `${CARD_MEDIA_CHILDREN_SELECTOR}, .card-content`;

export const LIBRARY_CARD_ITEM_SELECTOR = ".library-grid .library-card[data-library-item-id]";

export const SELECTED_LIBRARY_CARD_SELECTOR = ".library-card.is-selected";

export function libraryCardSelectorFor(itemId: string): string {
  return `.library-card[data-library-item-id="${CSS.escape(itemId)}"]`;
}


type VirtualizedLibraryItemProps = {
  data: LibraryItem;
  index: number;
  context: LibraryCardContext;
  slotClassName?: string;
};

export const VirtualizedLibraryItem = memo(function VirtualizedLibraryItem({
  data: item,
  index,
  context,
  slotClassName,
}: VirtualizedLibraryItemProps) {
  const archiveSelectionMode = context.archiveSelectionMode === true;
  const isArchivedItemSelected = context.isArchivedItemSelected?.(item) ?? false;
  const handleCardSelect = (event: React.MouseEvent<HTMLElement>) => {
    if (archiveSelectionMode) {
      event.preventDefault();
      context.onToggleArchivedItem?.(item);
      return;
    }
    context.onSelectItem(item, cardRectsFor(event.currentTarget));
  };

  return (
    <div className={`${LIBRARY_CARD_SLOT_CLASS} ${slotClassName ?? ""}`} data-library-index={index}>
      <article
        className={`${LIBRARY_CARD_CLASS} ${item.featured ? "featured-card" : ""} ${item.kind === "Note" ? "note-card" : item.kind === "Quote" ? "quote-card" : item.accent ?? ""} ${archiveSelectionMode ? "archive-selection-mode" : ""} ${isArchivedItemSelected ? "archive-card-selected" : ""}`}
        data-library-item-id={String(item.id)}
        style={{ "--card-media-ratio": String(mediaAspectRatioFor(item)) } as React.CSSProperties}
        onClick={handleCardSelect}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (archiveSelectionMode) {
            context.onToggleArchivedItem?.(item);
          } else {
            context.onSelectItem(item, cardRectsFor(event.currentTarget));
          }
        }}
      >
        {context.onDeleteArchivedItem && (
          <button
            type="button"
            className={`archive-card-delete ${archiveSelectionMode ? "archive-card-select" : ""} ${isArchivedItemSelected ? "is-selected" : ""}`}
            aria-label={archiveSelectionMode ? `${isArchivedItemSelected ? "Deselect" : "Select"} ${item.title}` : `Delete ${item.title}`}
            aria-pressed={archiveSelectionMode ? isArchivedItemSelected : undefined}
            title={archiveSelectionMode ? (isArchivedItemSelected ? "Deselect item" : "Select item") : "Delete permanently"}
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
              icon={archiveSelectionMode ? (isArchivedItemSelected ? CircleCheckIcon : CircleIcon) : Delete02Icon}
              size={archiveSelectionMode ? 24 : 15}
            />
          </button>
        )}
        <div className="library-card-media absolute inset-0 min-w-0">
          {item.social?.provider === "x" ? (
            <div className="x-post-art">
              <XPostEmbed
                social={item.social}
                fallback={item.post ? <PostArtwork post={item.post} /> : <div className={POST_ART_CLASS}>Post preview unavailable.</div>}
              />
            </div>
          ) : item.kind === "Video" ? (
            <LibraryVideoMedia item={item} index={index} />
          ) : item.image ? (
            <div className={CARD_IMAGE_WRAP_CLASS}>
              <img src={item.image} alt={item.imageAlt ?? item.title} className={CARD_IMAGE_CLASS} loading="lazy" decoding="async" fetchPriority={index < 6 ? "high" : undefined} />
            </div>
          ) : item.kind === "Post" && item.post ? (
            <PostArtwork post={item.post} />
          ) : (
            <div className={`${CARD_PAPER_ART_CLASS} ${item.kind === "Quote" ? "quote-art" : item.accent ?? ""}`} aria-hidden="true">
              {item.kind === "Article" && <><span className={`${PAPER_LINE_CLASS} line-one`} /><span className={`${PAPER_LINE_CLASS} line-two`} /><span className={PAPER_SEAL_CLASS}>m</span></>}
              {item.kind === "Note" && <NoteArtwork item={item} />}
              {item.kind === "PDF" && <PdfArtwork item={item} />}
              {item.kind === "Quote" && <><span className="quote-mark absolute left-[10%] top-[7%] font-[Georgia,serif] text-[104px] leading-[.9]">“</span><span className="quote-preview">{cardPreviewText(item.title, "Saved quote")}</span><span className="quote-line absolute right-[13%] bottom-[26%] h-px w-[46%]" /><span className="quote-attribution-preview">{item.description ? `${item.description.trim().startsWith("—") ? "" : "— "}${item.description.slice(0, 48)}` : ""}</span></>}
            </div>
          )}
        </div>
        <div className={`card-content hidden ${item.kind === "Quote" ? "quote-content" : item.kind === "Note" ? "note-content" : ""}`}>
          <div className="card-kicker"><span><KindIcon kind={item.kind} />{item.kind}</span><span>{item.date}</span></div>
          <h2 className={item.kind === "Quote" ? "quote-title" : ""}>{item.kind === "Quote" ? (/^["“]/u.test(item.title.trim()) ? item.title : `“${item.title}”`) : item.title}</h2>
          <p className={item.kind === "Quote" ? "quote-attribution" : ""}>{item.description ? (item.kind === "Quote" && !item.description.trim().startsWith("—") ? `— ${item.description}` : item.description) : (item.kind === "Quote" ? "" : item.description)}</p>
          {item.processing?.active && (
            <div className="card-processing" role="status">
              <HugeiconsIcon icon={Loading01Icon} size={13} />
              <span>{item.processing.message ?? "Processing"}</span>
              {item.processing.progressTotal != null && <span>{item.processing.progressCurrent}/{item.processing.progressTotal}</span>}
            </div>
          )}
          {item.processing?.failedJob && (
            <div className="card-processing failed" role="alert">
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
          <div className="card-footer">
            <span className="card-source">{item.source}</span>
            {item.kind === "Article" && (
              <button
                type="button"
                className="card-read"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  context.onOpenReader(item, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    context.onOpenReader(item);
                  }
                }}
                disabled={!item.articleHtml}
                title={item.articleHtml ? "Open reader" : "No saved article text"}
              >
                Read <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
              </button>
            )}
            {item.kind === "Video" && item.video && (
              <button
                type="button"
                className="card-read"
                onClick={(event) => {
                  event.stopPropagation();
                  const card = event.currentTarget.closest<HTMLElement>(".library-card");
                  context.onSelectItem(item, card ? cardRectsFor(card) : undefined);
                }}
              >
                Watch <HugeiconsIcon icon={PlayIcon} size={11} />
              </button>
            )}
            {!(item.kind === "Article" || (item.kind === "Video" && item.video)) && <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />}
          </div>
        </div>
      </article>
    </div>
  );
});
