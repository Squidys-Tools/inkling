import {
  assetUrl,
  type ProcessingSummary,
  type StoredLibraryCard,
  type StoredLibraryItem,
  type StoredLibraryItemDetail,
} from "../../lib/libraryApi";
import type { XPostMetadata } from "../../lib/ingestion/types";
import { safePublicImageUrl } from "../../lib/ingestion/url";
import { videoLinkFromSourceUrl } from "../../lib/ingestion/video-links";
import { normalizeNoteBody } from "../../lib/notes";
import type { ItemKind, LibraryItem } from "../../lib/types";

function displayKind(kind: string): ItemKind {
  switch (kind.toLowerCase()) {
    case "article":
    case "url":
      return "Article";
    case "image":
      return "Image";
    case "note":
      return "Note";
    case "quote":
      return "Quote";
    case "pdf":
      return "PDF";
    case "video":
    case "embed":
      return "Video";
    case "post":
    case "tweet":
      return "Post";
    case "file":
      return "File";
    default:
      return "Note";
  }
}

function formatItemDate(timestamp: number) {
  const date = new Date(timestamp);
  const age = Date.now() - date.getTime();
  if (age < 60 * 60 * 1000) return "Just now";
  if (age < 24 * 60 * 60 * 1000) return "Today";
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function readXPostMetadata(value: unknown): XPostMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.provider !== "x" ||
    typeof record.postUrl !== "string" ||
    typeof record.postId !== "string"
  ) {
    return undefined;
  }

  return {
    provider: "x",
    postUrl: record.postUrl,
    postId: record.postId,
    embedHtml: typeof record.embedHtml === "string" ? record.embedHtml : undefined,
    authorName: typeof record.authorName === "string" ? record.authorName : undefined,
    authorUrl: typeof record.authorUrl === "string" ? record.authorUrl : undefined,
    authorHandle: typeof record.authorHandle === "string" ? record.authorHandle : undefined,
    text: typeof record.text === "string" ? record.text : undefined,
    publishedDate: typeof record.publishedDate === "string" ? record.publishedDate : null,
    width: typeof record.width === "number" ? record.width : null,
  };
}

export function postFallbackFromMetadata(social: XPostMetadata): NonNullable<LibraryItem["post"]> {
  const published = social.publishedDate
    ? new Date(social.publishedDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "On X";
  return {
    displayName: social.authorName ?? "X user",
    handle: social.authorHandle ? `@${social.authorHandle.replace(/^@/u, "")}` : "@x",
    body: social.text ?? "Post preview unavailable.",
    published,
  };
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function readImageDimensions(
  src: string,
): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      resolve(width > 0 && height > 0 ? { width, height } : undefined);
    };
    image.onerror = () => resolve(undefined);
    image.src = src;
  });
}

export function metadataTags(metadata: Record<string, unknown>) {
  const tags = metadata.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

export function cardKind(item: StoredLibraryItem | StoredLibraryCard): ItemKind {
  if (readXPostMetadata(item.metadata.social)) return "Post";
  const baseKind = displayKind(item.kind);
  return baseKind === "Article" && videoLinkFromSourceUrl(item.sourceUrl) ? "Video" : baseKind;
}

export async function storedItemToLibraryItem(
  item: StoredLibraryItem | StoredLibraryCard,
  processing?: ProcessingSummary,
): Promise<LibraryItem> {
  const social = readXPostMetadata(item.metadata.social);
  const baseKind = displayKind(item.kind);
  const videoLink = baseKind === "Article" ? videoLinkFromSourceUrl(item.sourceUrl) : null;
  const kind = cardKind(item);
  const hasArticleContent =
    "hasArticleContent" in item
      ? item.hasArticleContent
      : typeof item.metadata.html === "string" && Boolean(item.metadata.html.trim());
  const pdfPageCount =
    baseKind === "PDF" &&
    typeof item.metadata.pdfPageCount === "number" &&
    Number.isInteger(item.metadata.pdfPageCount) &&
    item.metadata.pdfPageCount > 0
      ? item.metadata.pdfPageCount
      : undefined;

  const remoteImage = Array.isArray(item.metadata.imageUrls)
    ? item.metadata.imageUrls
        .map(safePublicImageUrl)
        .find((value): value is string => value !== undefined)
    : undefined;
  const indexedImageDimensions = Array.isArray(item.metadata.imageDimensions)
    ? item.metadata.imageDimensions.find((value): value is Record<string, unknown> => {
        if (!value || typeof value !== "object") return false;
        const record = value as Record<string, unknown>;
        return (
          (!remoteImage || record.url === remoteImage) &&
          positiveNumber(record.width) !== undefined &&
          positiveNumber(record.height) !== undefined
        );
      })
    : undefined;
  const mediaWidth =
    positiveNumber(item.metadata.mediaWidth) ?? positiveNumber(indexedImageDimensions?.width);
  const mediaHeight =
    positiveNumber(item.metadata.mediaHeight) ?? positiveNumber(indexedImageDimensions?.height);
  const storedAspectRatio = positiveNumber(item.metadata.mediaAspectRatio);
  // A new image's thumbnail is made in the background, so until it lands (or
  // if it never can be) the card shows the original instead of a placeholder.
  const image =
    (await assetUrl(item.thumbnailPath ?? (kind === "Image" ? item.localAssetPath : null))) ??
    remoteImage ??
    videoLink?.posterUrl;
  // For an image this is the original file, which the item view swaps in once
  // the user zooms past fit. It is not a fallback thumbnail.
  const fileUrl =
    kind === "PDF" || kind === "Video" || kind === "Image"
      ? await assetUrl(item.localAssetPath)
      : undefined;
  const source = social
    ? `X${social.authorHandle ? ` · @${social.authorHandle.replace(/^@/u, "")}` : ""}`
    : item.sourceLabel || item.sourceUrl || "Quick note";

  const isQuote = kind === "Quote";
  const noteBody =
    kind === "Note" && "body" in item && typeof item.body === "string"
      ? normalizeNoteBody(item.body)
      : undefined;
  const rawTitle = item.title?.trim() || "Untitled note";
  // The backend already stored `markdownToPlainText(body)` as the
  // description, so a note's plain text arrives ready to read. Projecting the
  // body again here would only ever disagree with the stored row, and would
  // eat the brackets in prose that happens to look like a link.
  const rawDescription =
    item.description?.trim() ||
    item.ocrText?.trim().slice(0, 180) ||
    (isQuote ? "" : "Saved to your mind.");

  return {
    id: item.id,
    kind,
    title: rawTitle,
    description: social?.text?.trim() || rawDescription,
    noteBody,
    source,
    sourceUrl: item.sourceUrl ?? undefined,
    date: formatItemDate(item.createdAt),
    createdAt: item.createdAt,
    tags: metadataTags(item.metadata),
    ocrText: item.ocrText,
    image,
    mediaWidth,
    mediaHeight,
    mediaAspectRatio:
      storedAspectRatio ?? (mediaWidth && mediaHeight ? mediaWidth / mediaHeight : undefined),
    pdfPageCount,
    palette: item.palette?.length ? item.palette : undefined,
    durationSeconds: positiveNumber(item.metadata.durationSeconds),
    fileSizeBytes: positiveNumber(item.metadata.fileSizeBytes),
    readingMinutes: positiveNumber(item.metadata.readingMinutes),
    fileUrl,
    imageAlt: item.title?.trim() || undefined,
    social,
    post: social ? postFallbackFromMetadata(social) : undefined,
    accent: isQuote ? "bg-yellow-soft" : undefined,
    archived: item.archived,
    processing,
    hasArticleContent,
    video: videoLink ?? undefined,
  };
}

export function withArticleContent(
  item: LibraryItem,
  storedItem: StoredLibraryItemDetail,
): LibraryItem {
  const articleHtml =
    typeof storedItem.metadata.html === "string" && storedItem.metadata.html.trim()
      ? storedItem.metadata.html
      : undefined;
  return {
    ...item,
    hasArticleContent: Boolean(articleHtml),
    articleHtml,
    articleAuthor:
      typeof storedItem.metadata.author === "string" ? storedItem.metadata.author : undefined,
    publishedDate:
      typeof storedItem.metadata.publishedDate === "string"
        ? storedItem.metadata.publishedDate
        : undefined,
  };
}

// Note bodies are cached so an opened note is not re-fetched and a refresh does
// not drop a body the list query never carries. Same LRU shape as the asset URL
// cache: writes re-insert, so the oldest key is the least recently used body.
const NOTE_BODY_CACHE_LIMIT = 200;
export function rememberNoteBody(cache: Map<string, string>, id: string, body: string) {
  cache.delete(id);
  if (cache.size >= NOTE_BODY_CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.value !== undefined) cache.delete(oldest.value);
  }
  cache.set(id, body);
}
