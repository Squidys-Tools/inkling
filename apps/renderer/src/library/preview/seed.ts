import type { LibraryCard } from "@inkling/contracts";
import {
  seedArticles,
  seedBodies,
  seedItems,
  seedJobs,
  seedMembership,
  seedSpaces,
  type SeedItem,
} from "./seed-data.ts";

// The web preview's library: the demo seed in ./seed-demo, plus one item of each
// kind the seed lacks. Image sizes match the files, so cards keep their real proportions.
const files = import.meta.glob<string>("./seed-demo/*", {
  eager: true,
  query: "?url",
  import: "default",
});
const file = (name: string) => files[`./seed-demo/${name}`];

const day = 24 * 60 * 60 * 1000;
const base = Date.now() - 30 * 60 * 1000;

const card = (item: SeedItem): LibraryCard => ({
  id: item.id,
  kind: item.kind,
  title: item.title,
  description: item.description ?? null,
  sourceUrl: item.sourceUrl ?? null,
  sourceLabel: item.source ?? null,
  localAssetPath: item.file ? file(item.file) : null,
  thumbnailPath:
    item.kind === "image" && item.file
      ? file(item.file)
      : item.thumbnailFile
        ? file(item.thumbnailFile)
        : null,
  ocrText: "",
  createdAt: base - Math.floor(item.index / 2) * day,
  updatedAt: base - Math.floor(item.index / 2) * day,
  archived: false,
  hasArticleContent: item.hasArticleContent ?? false,
  metadata: { ...item.metadata },
});

/** Newest first, the way the library sends a page. */
export const seedCards: LibraryCard[] = seedItems
  .map(card)
  .sort((a, b) => b.createdAt - a.createdAt);

export const seedArchived: LibraryCard[] = seedItems
  .filter((item) => item.archivedCopy)
  .map((item) => ({ ...card(item), id: `archive-${item.id}`, archived: true }));

export { seedArticles, seedBodies, seedJobs, seedMembership, seedSpaces };
