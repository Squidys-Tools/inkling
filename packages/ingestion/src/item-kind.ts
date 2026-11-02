import { videoLinkFromSourceUrl } from "./video-links.ts";

export const ITEM_KINDS = [
  "Article",
  "Image",
  "Note",
  "PDF",
  "Quote",
  "Video",
  "Post",
  "File",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Maps a stored `kind`, including the older spellings, to the kind a card shows. */
export function displayKind(kind: string): ItemKind {
  switch (kind.toLowerCase()) {
    case "article":
    case "url":
      return "Article";
    case "image":
      return "Image";
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

// Cards and the Settings breakdown both call this, so a count always matches the cards it counts.
export function itemKind(kind: string, sourceUrl: string | null | undefined, isXPost: boolean) {
  if (isXPost) return "Post";
  const base = displayKind(kind);
  return base === "Article" && videoLinkFromSourceUrl(sourceUrl) ? "Video" : base;
}
