import type { LibraryCard } from "@inkling/contracts";
import type { XPost } from "@inkling/contracts/jobs";
import type { SeedItem } from "./seed-data.ts";

// Apart from seed-data.ts, which the site demo must not bundle: its posts are built by calls
// the bundler cannot drop, so importing anything from it carries the whole dev seed.

/** The post with each picture's seed file name turned into the path a mode serves it from. */
export function seedPostPaths(post: XPost, path: (file: string) => string): XPost {
  const at = (file: string | undefined) => (file ? path(file) : undefined);
  const media = (list: XPost["media"]) =>
    list?.map((entry) => ({ ...entry, path: at(entry.path) }));
  return {
    ...post,
    avatarPath: at(post.avatarPath),
    media: media(post.media),
    quote: post.quote && {
      ...post.quote,
      avatarPath: at(post.quote.avatarPath),
      media: media(post.quote.media),
    },
    linkCard: post.linkCard && { ...post.linkCard, imagePath: at(post.linkCard.imagePath) },
  };
}

/**
 * The cards the preview library starts with, newest first, and the archived
 * copies. `url` turns a seed file name into the bundler's URL for it.
 */
export function projectSeed(items: SeedItem[], url: (file: string) => string) {
  const day = 24 * 60 * 60 * 1000;
  const base = Date.now() - 30 * 60 * 1000;
  const card = (item: SeedItem): LibraryCard => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    description: item.description ?? null,
    sourceUrl: item.sourceUrl ?? null,
    sourceLabel: item.source ?? null,
    localAssetPath: item.file ? url(item.file) : null,
    thumbnailPath:
      item.kind === "image" && item.file
        ? url(item.file)
        : item.thumbnailFile
          ? url(item.thumbnailFile)
          : null,
    ocrText: "",
    createdAt: base - Math.floor(item.index / 2) * day,
    updatedAt: base - Math.floor(item.index / 2) * day,
    archived: false,
    hasArticleContent: item.hasArticleContent ?? false,
    metadata: {
      ...item.metadata,
      ...(item.xPost && { social: seedPostPaths(item.xPost, url) }),
    },
  });
  return {
    active: items.map(card).sort((a, b) => b.createdAt - a.createdAt),
    archived: items
      .filter((item) => item.archivedCopy)
      .map((item) => ({ ...card(item), id: `archive-${item.id}`, archived: true })),
  };
}
