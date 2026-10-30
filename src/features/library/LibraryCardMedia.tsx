import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { canvasImageCrossOrigin } from "../../components/LiquidGlass";
import {
  FileArtwork,
  formatDuration,
  NoteArtwork,
  PdfArtwork,
  PostArtwork,
  QuoteArtwork,
} from "../../components/ItemMedia";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";

export type CardLayout = "grid" | "list" | "archive";

// Each type gets its own treatment. Posts, images and videos with no artwork
// fall back to the typed file layout.
export type CardKind = "note" | "quote" | "pdf" | "article" | "video" | "file" | "media";

export function cardKindOf(item: LibraryItem): CardKind {
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

export type MediaKind = "x-post" | "video" | "image" | "post" | "paper";

export function mediaKindOf(item: LibraryItem): MediaKind {
  if (item.social?.provider === "x" && item.post) return "x-post";
  if (item.kind === "Video" && item.image) return "video";
  if (item.image) return "image";
  if (item.kind === "Post" && item.post) return "post";
  return "paper";
}

// Media fills the card in the grid; in a list row it sits in the 155px column
// and grows with the text.
const MEDIA_FILL =
  "pointer-events-none absolute inset-0 size-full min-h-0 aspect-auto object-cover";
const MEDIA_ROW = "pointer-events-none relative inset-auto h-full w-auto aspect-auto object-cover";

export function quoteAttribution(description: string): string {
  const text = description.trim();
  if (!text) return "";
  return text.startsWith("—") ? text : `— ${text}`;
}

// Quotes show in full on the card; the art clamps only very long ones.
function cardText(value: string | undefined, fallback: string): string {
  return value?.replace(/\s+/gu, " ").trim() || fallback;
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

export function CardMedia({
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
            : (item.accent ?? "bg-surface"),
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
