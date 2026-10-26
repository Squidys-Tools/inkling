import type { StoredSpace } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";

// vite.config.ts defines VITE_INKLING_SEED as "0" for `--mode app`, so a shipped
// build drops this glob and never bundles the seed. A runtime check would leave
// the bytes in. scripts/assert-no-demo-seed.ts guards it.
const personalSeedModules: Record<string, { personalSeedItems?: LibraryItem[] }> =
  import.meta.env.VITE_INKLING_SEED === "0"
    ? {}
    : import.meta.glob<{ personalSeedItems?: LibraryItem[] }>("../../seedPersonal.ts", {
        eager: true,
      });
const localSeedItems: LibraryItem[] =
  Object.values(personalSeedModules)[0]?.personalSeedItems ?? [];

const seedItems: LibraryItem[] = [
  {
    id: 1,
    kind: "Article",
    title: "As We May Think",
    description:
      "Vannevar Bush imagines the memex: a personal desk for storing, linking, and revisiting everything worth reading.",
    source: "The Atlantic",
    sourceUrl: "https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/",
    author: "Vannevar Bush",
    image:
      "https://cdn.theatlantic.com/thumbor/p3pkh2RYR4qWpQk3qC6zhJpPd9Y=/0x350:2994x1909/1200x625/media/img/2018/03/AP_413517775098/original.jpg",
    mediaWidth: 1200,
    mediaHeight: 625,
    imageAlt: "A historical photograph from The Atlantic's archive accompanying As We May Think",
    date: "Saved today",
    tags: ["essay", "memory"],
    accent: "ink",
    featured: true,
  },
  {
    id: 2,
    kind: "Image",
    title: "Lago di Braies, Dolomites",
    description: "The boathouse at the north shore, before the day-trippers arrive.",
    source: "Unsplash",
    sourceUrl:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1800&q=90",
    date: "Yesterday",
    tags: ["landscape", "reference"],
    image:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A wooden boat house beside a clear alpine lake with mountains behind it",
  },
  {
    id: 3,
    kind: "Article",
    title: "How to Do Great Work",
    description:
      "Paul Graham’s guide to choosing work, following curiosity to the frontier, and making successive versions until something great appears.",
    source: "Paul Graham",
    sourceUrl: "https://paulgraham.com/greatwork.html",
    author: "Paul Graham",
    image:
      "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A notebook and coffee on a desk, a quiet setting for doing great work",
    date: "Aug 20",
    tags: ["essay", "work"],
  },
  {
    id: 4,
    kind: "Image",
    title: "Wireframes on a design desk",
    description:
      "A real product sketch: paper prototypes, a pencil, and the first shape of a flow.",
    source: "Unsplash",
    sourceUrl:
      "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=1800&q=90",
    date: "Aug 18",
    tags: ["ui", "reference"],
    image:
      "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A designer sketching interface wireframes on paper beside a laptop",
  },
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
    id: 6,
    kind: "Image",
    title: "A dashboard worth studying",
    description:
      "Dark UI, dense information, and just enough color to make the important number pop.",
    source: "Unsplash",
    sourceUrl:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1800&q=90",
    date: "Aug 12",
    tags: ["ui", "reference"],
    image:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A dark analytics dashboard with charts and colorful data visualizations",
  },
  {
    id: 7,
    kind: "Article",
    title: "10 Usability Heuristics for User Interface Design",
    description:
      "Jakob Nielsen’s durable checklist for interfaces: visibility, user control, error recovery, consistency, and more.",
    source: "Nielsen Norman Group",
    sourceUrl: "https://www.nngroup.com/articles/ten-usability-heuristics/",
    author: "Jakob Nielsen",
    image:
      "https://media.nngroup.com/media/articles/opengraph_images/Updated10HeuristicSocialCard-36.png",
    mediaWidth: 1200,
    mediaHeight: 630,
    imageAlt: "Nielsen Norman Group social card for the ten usability heuristics",
    date: "Aug 08",
    tags: ["ui", "ux", "heuristics"],
  },
  {
    id: 8,
    kind: "Video",
    title: "Inventing on Principle",
    description:
      "Bret Victor argues creators should see and react to their work instantly — the talk that reframed how a generation thinks about tooling.",
    source: "Bret Victor",
    sourceUrl: "https://worrydream.com/#!/InventingOnPrinciple",
    author: "Bret Victor",
    image: "https://i.ytimg.com/vi/PUv66718DII/hqdefault.jpg",
    mediaAspectRatio: 16 / 9,
    imageAlt: "Bret Victor presenting Inventing on Principle",
    video: {
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/PUv66718DII",
      sourceUrl: "https://worrydream.com/#!/InventingOnPrinciple",
      posterUrl: "https://i.ytimg.com/vi/PUv66718DII/hqdefault.jpg",
    },
    date: "Aug 05",
    tags: ["talks", "design"],
  },
  {
    id: 9,
    kind: "Image",
    title: "Peaks above a sea of clouds",
    description: "Alpine dusk from above the cloud layer.",
    source: "Unsplash",
    sourceUrl:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1800&q=90",
    date: "Aug 02",
    tags: ["landscape", "color"],
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "Snowy mountain peaks glowing above a sea of clouds at sunset",
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
    id: 11,
    kind: "Image",
    title: "A web layout in the wild",
    description:
      "A product page on a laptop: editorial spacing, a strong image, and a single clear action.",
    source: "Unsplash",
    sourceUrl:
      "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=1800&q=90",
    date: "Jul 24",
    tags: ["web", "ui", "reference"],
    image:
      "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=1000&q=85",
    mediaAspectRatio: 3 / 2,
    imageAlt: "A laptop displaying a colorful web page on a wooden desk",
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
  {
    id: 14,
    kind: "Image",
    title: "Ceramic pour-over set",
    description: "Brewing over a ceramic dripper — comparing this carafe before ordering.",
    source: "Design Milk",
    sourceUrl: "https://design-milk.com/",
    date: "Aug 28",
    tags: ["kitchen", "wishlist"],
    image:
      "https://app.paper.design/file-assets/01M0A79VARA1BWFSH86J9CHQG6/01M1PZCZB7TW62ZG0D1W6ZSFA2.png",
    mediaWidth: 1024,
    mediaHeight: 1024,
    imageAlt: "A ceramic pour-over coffee dripper brewing into a glass carafe on an oak counter",
  },
  {
    id: 15,
    kind: "Image",
    title: "Reading corner for the new place",
    description: "Low oak shelf, boucle chair, warm lamp — the layout to steal.",
    source: "Dezeen",
    sourceUrl: "https://www.dezeen.com/",
    date: "Aug 26",
    tags: ["interior", "reference"],
    image:
      "https://app.paper.design/file-assets/01M0A79VARA1BWFSH86J9CHQG6/01M1PZDKY4T8RYWPH59K4BP4QY.png",
    mediaWidth: 1232,
    mediaHeight: 816,
    imageAlt: "A cozy reading nook with a low bookshelf, boucle armchair, and floor lamp",
  },
  {
    id: 16,
    kind: "Image",
    title: "Spiral stairwell in concrete",
    description: "Daylight down a concrete spiral — saved for the presentation moodboard.",
    source: "ArchDaily",
    sourceUrl: "https://www.archdaily.com/",
    date: "Aug 22",
    tags: ["architecture", "reference"],
    image:
      "https://app.paper.design/file-assets/01M0A79VARA1BWFSH86J9CHQG6/01M1PZDZZZ3CZ3W7HBVKXDMN0M.png",
    mediaWidth: 1232,
    mediaHeight: 816,
    imageAlt: "Looking up inside a brutalist concrete spiral stairwell lit by a skylight",
  },
  {
    id: 17,
    kind: "Image",
    title: "Café to try in Lisbon",
    description: "Pastéis de nata and a cortado — saved from the travel thread.",
    source: "Time Out",
    sourceUrl: "https://www.timeout.com/lisbon",
    date: "Aug 19",
    tags: ["travel", "food"],
    image:
      "https://app.paper.design/file-assets/01M0A79VARA1BWFSH86J9CHQG6/01M1PZECGMBTJFQEFCEYN8N27F.png",
    mediaWidth: 1232,
    mediaHeight: 816,
    imageAlt: "A cortado and two custard tarts on a marble café table",
  },
];

export const demoSeedItems: LibraryItem[] =
  localSeedItems.length > 0
    ? shuffledDemo([
        ...localSeedItems,
        ...seedItems.filter((item) => [5, 10, 12, 13].includes(Number(item.id))),
      ])
    : seedItems;
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
