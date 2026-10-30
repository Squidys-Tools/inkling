import type { LibraryFileKind } from "../../lib/ingestion/file-classification";
import { videoLinkFromSourceUrl } from "../../lib/ingestion/video-links";
import { markdownToPlainText, normalizeNoteBody } from "../../lib/notes";
import type { LibraryItem } from "../../lib/types";
import { hostnameForUrl } from "../hostname";
import { postFallbackFromMetadata, readImageDimensions } from "../library/libraryItem";

// Preview has no desktop backend, so each capture path builds its card here.

export async function previewFileItem(
  file: File,
  kind: LibraryFileKind,
  captureSource: string,
): Promise<LibraryItem> {
  const image = kind === "image" ? URL.createObjectURL(file) : undefined;
  const mediaDimensions = image ? await readImageDimensions(image) : undefined;
  return {
    id: crypto.randomUUID(),
    kind: kind === "image" ? "Image" : kind === "pdf" ? "PDF" : kind === "video" ? "Video" : "File",
    title: file.name,
    description: `Saved from ${captureSource}.`,
    source: captureSource,
    date: "Just now",
    tags: [],
    image,
    fileUrl: kind === "video" ? URL.createObjectURL(file) : undefined,
    mediaWidth: mediaDimensions?.width,
    mediaHeight: mediaDimensions?.height,
  };
}

export function previewArticleItem(url: URL, title: string): LibraryItem {
  return {
    id: Date.now(),
    kind: "Article",
    title,
    description: "",
    source: url.hostname,
    sourceUrl: url.toString(),
    date: "Just now",
    tags: [],
  };
}

// Resolves to an updater that swaps the provisional card for the extracted
// article, keeping a title the user or the extension already gave it.
export async function previewArticleEnrichment(
  url: string,
  fallbackItem: LibraryItem,
  preservedTitle: string | undefined,
) {
  const { ingestUrl } = await import("../../lib/ingestion");
  const article = await ingestUrl(url);
  const fallbackTitle = fallbackItem.title;
  const social = article.social;
  const embeddedVideoLink = social ? null : videoLinkFromSourceUrl(article.canonicalUrl);
  const firstImageDimensions = article.imageDimensions.find(
    (value) => value.url === article.imageUrls[0],
  );
  const enrichedItem: LibraryItem = {
    ...fallbackItem,
    kind: social ? "Post" : embeddedVideoLink ? "Video" : "Article",
    title: article.title || fallbackTitle,
    description: article.description || article.text.slice(0, 180),
    source: social
      ? `X${social.authorHandle ? ` · @${social.authorHandle.replace(/^@/u, "")}` : ""}`
      : new URL(article.canonicalUrl).hostname,
    sourceUrl: article.canonicalUrl,
    author: article.author,
    image: article.imageUrls[0],
    mediaWidth: firstImageDimensions?.width,
    mediaHeight: firstImageDimensions?.height,
    mediaAspectRatio: firstImageDimensions
      ? firstImageDimensions.width / firstImageDimensions.height
      : undefined,
    articleAuthor: article.author || undefined,
    publishedDate: article.publishedDate ?? undefined,
    articleHtml: article.html || undefined,
    hasArticleContent: Boolean(article.html.trim()),
    social,
    post: social ? postFallbackFromMetadata(social) : undefined,
    video: embeddedVideoLink ?? undefined,
  };
  return (item: LibraryItem) =>
    String(item.id) === String(fallbackItem.id)
      ? {
          ...enrichedItem,
          title:
            preservedTitle || item.title !== fallbackTitle
              ? item.title
              : article.title || item.title,
        }
      : item;
}

export function previewNoteItem(text: string, captureSource: string): LibraryItem {
  return {
    id: Date.now(),
    kind: "Note",
    title: text,
    description: markdownToPlainText(text),
    noteBody: normalizeNoteBody(text),
    source: captureSource,
    date: "Just now",
    tags: [],
    accent: "bg-blue-soft",
  };
}

export function previewQuoteItem(
  body: string,
  attribution: string,
  sourceUrl: string,
): LibraryItem {
  return {
    id: Date.now(),
    kind: "Quote",
    title: body,
    description: attribution,
    source: sourceUrl
      ? (hostnameForUrl(sourceUrl) ?? sourceUrl)
      : attribution.split(",")[0]?.trim() || "Quote",
    date: "Just now",
    tags: [],
    accent: "bg-yellow-soft",
    sourceUrl: sourceUrl || undefined,
  };
}
