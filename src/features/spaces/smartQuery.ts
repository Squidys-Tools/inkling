import type { SmartSpaceQuery, StoredSpace } from "../../lib/libraryApi";
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
function itemMatchesSmartQuery(item: LibraryItem, spaceQuery: SmartSpaceQuery) {
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

// The desktop backend already searched and listed the open Space, so only the
// "Everything" view gate applies there; preview filters the seed items here.
export function visibleLibraryItems(
  items: LibraryItem[],
  {
    canUseDesktopBackend,
    query,
    activeView,
    activeSpace,
    localSpaceItems,
  }: {
    canUseDesktopBackend: boolean;
    query: string;
    activeView: string;
    activeSpace: StoredSpace | null;
    localSpaceItems: Map<string, Set<string>>;
  },
) {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesQuery =
      !normalizedQuery ||
      canUseDesktopBackend ||
      Boolean(activeSpace) ||
      [item.title, item.description, item.source, item.kind, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    const matchesView =
      activeView === "Everything" ||
      (activeSpace
        ? canUseDesktopBackend ||
          (activeSpace.kind === "regular"
            ? (localSpaceItems.get(activeSpace.id)?.has(String(item.id)) ?? false)
            : itemMatchesSmartQuery(item, activeSpace.query))
        : false);
    return matchesQuery && matchesView;
  });
}
