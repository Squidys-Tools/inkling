import type { StoredSpace } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";

// vite.config.ts defines VITE_INKLING_SEED as "0" for `--mode app`, so a shipped
// build drops this glob and never bundles the seed. A runtime check would leave
// the bytes in. scripts/assert-no-demo-seed.ts guards it.
const personalSeedModules =
  import.meta.env.VITE_INKLING_SEED === "0"
    ? {}
    : import.meta.glob<{ personalSeedItems: LibraryItem[] }>("../../seedPersonal.ts", {
        eager: true,
      });
const personalSeedItems = Object.values(personalSeedModules)[0]?.personalSeedItems ?? [];

// Four keepers from the original demo set, mixed in with the personal items.
const keeperItems: LibraryItem[] = [
  {
    id: 5,
    kind: "Post",
    title: "The first post on Twitter",
    description: "A two-word product launch document from the first day of Twitter.",
    source: "X · @jack",
    sourceUrl: "https://x.com/jack/status/20",
    date: "Mar 21, 2006",
    tags: ["twitter", "history", "post"],
    social: {
      provider: "x",
      postUrl: "https://x.com/jack/status/20",
      postId: "20",
      embedHtml:
        '<blockquote class="twitter-tweet" data-width="550" data-dnt="true" data-theme="light"><p lang="en" dir="ltr">just setting up my twttr</p>&mdash; jack (@jack) <a href="https://x.com/jack/status/20?ref_src=twsrc%5Etfw">March 21, 2006</a></blockquote>',
    },
    post: {
      displayName: "jack",
      handle: "@jack",
      body: "just setting up my twttr",
      published: "Mar 21, 2006",
      avatarUrl: "https://unavatar.io/twitter/jack",
    },
  },
  {
    id: 10,
    kind: "PDF",
    title: "Attention Is All You Need",
    description:
      "The transformer paper. Eight authors, one architecture, and the beginning of everything since.",
    source: "arXiv",
    sourceUrl: "https://arxiv.org/abs/1706.03762",
    image: "https://arxiv.org/html/1706.03762/x1.png",
    mediaAspectRatio: 4 / 3,
    imageAlt: "The transformer architecture diagram from Attention Is All You Need",
    date: "Jul 29",
    tags: ["research", "ml"],
    accent: "bg-green-soft",
  },
  {
    id: 12,
    kind: "Note",
    title: "Books to reread this fall",
    description:
      "Pilgrim at Tinker Creek, The Design of Everyday Things, Seeing Like a State. Start with the Dillard.",
    noteBody:
      "# Books to reread this fall\n\n- [ ] Pilgrim at Tinker Creek\n- [ ] The Design of Everyday Things\n- [ ] Seeing Like a State\n\nStart with the Dillard.",
    source: "Quick note",
    date: "Jul 19",
    tags: ["books", "life"],
    accent: "bg-yellow-soft",
  },
  {
    id: 13,
    kind: "Quote",
    title: "“It is not that we have a short time to live, but that we waste a lot of it.”",
    description: "— Seneca",
    source: "On the Shortness of Life",
    date: "Jul 11",
    tags: ["writing", "time"],
    accent: "bg-yellow-soft",
    sourceUrl: "https://en.wikisource.org/wiki/Of_The_Shortness_of_Life/Chapter_1",
  },
];

export const demoSeedItems = shuffledDemo([...personalSeedItems, ...keeperItems]);

function shuffledDemo<T>(input: T[]): T[] {
  const array = [...input];
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const previewArchivedItems: LibraryItem[] = demoSeedItems
  .filter((item) => [10, 12, 5].includes(Number(item.id)))
  .map((item) => ({ ...item, id: `archive-${item.id}`, archived: true }));
export const browserArchivedItems = import.meta.env.DEV ? previewArchivedItems : [];

export const seedSpaces: StoredSpace[] = [
  {
    id: "seed-design-references",
    name: "Design references",
    color: "orange",
    query: { tag: "reference" },
    kind: "smart",
    position: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-read-later",
    name: "Read later",
    color: "green",
    query: { tag: "essay" },
    kind: "smart",
    position: 2,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-weekend-reading",
    name: "Weekend reading",
    color: "pink",
    query: {},
    kind: "regular",
    position: 3,
    createdAt: 0,
    updatedAt: 0,
  },
];

// Only ids the demo seed keeps (5, 10, 12, 13). The archived copies are re-keyed,
// so these originals stay in the library.
export const seedSpaceItems: Record<string, string[]> = {
  "seed-weekend-reading": ["5", "13"],
};
