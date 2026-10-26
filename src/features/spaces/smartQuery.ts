import type { SmartSpaceQuery } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";

const KIND_ALIASES: Record<string, string> = {
  article: "article",
  url: "article",
  image: "image",
  note: "note",
  quote: "quote",
  pdf: "pdf",
  video: "video",
  embed: "video",
  file: "file",
  post: "post",
  tweet: "post",
};

function canonicalKind(kind: string) {
  const normalized = kind.trim().toLowerCase();
  return KIND_ALIASES[normalized] ?? normalized;
}

// Mirrors the backend's Smart Space evaluation for browser (seed data) mode.
// In the desktop app the saved query is evaluated lazily by the Electron backend.
export function itemMatchesSmartQuery(item: LibraryItem, spaceQuery: SmartSpaceQuery) {
  if (
    spaceQuery.tag &&
    !item.tags.some((tag) => tag.toLowerCase() === spaceQuery.tag?.toLowerCase())
  ) {
    return false;
  }
  if (spaceQuery.kind && canonicalKind(item.kind) !== canonicalKind(spaceQuery.kind)) return false;

  const text = spaceQuery.text?.trim().toLowerCase();
  if (
    text &&
    ![item.title, item.description, item.source, ...item.tags]
      .join(" ")
      .toLowerCase()
      .includes(text)
  ) {
    return false;
  }

  return true;
}
