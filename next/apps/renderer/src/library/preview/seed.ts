import type { LibraryCard, Space } from "@inkling/contracts";

// The web preview's library: the demo seed from the old app's public/seed-demo
// and seedPersonal.ts, plus one item of each kind the seed lacks. Image sizes
// match the files, so cards keep their real proportions.
const files = import.meta.glob<string>("./seed-demo/*", {
  eager: true,
  query: "?url",
  import: "default",
});
const file = (name: string) => files[`./seed-demo/${name}`];

type SeedRow = {
  id: string;
  kind: string;
  title: string;
  description: string;
  source: string;
  tags: string[];
  file: string;
  width: number;
  height: number;
  alt: string;
};

const personal: SeedRow[] = [
  {
    id: "me-fuji-night",
    kind: "image",
    title: "Fuji over the village lights",
    description: "Nightfall with the town glowing below the mountain.",
    source: "Downloads",
    tags: ["photography", "japan", "landscape"],
    file: "compressO-6248AFB9-CEA1-45EE-944A-06CD88501EF8.jpg",
    width: 4000,
    height: 6000,
    alt: "Mount Fuji at night above a village glowing with lights",
  },
  {
    id: "me-spidey-rain",
    kind: "image",
    title: "Spider-Man in the rain",
    description: "Crouched on a gargoyle, rain coming down hard.",
    source: "Downloads",
    tags: ["comics", "wallpaper"],
    file: "compressO-IMG_4631.jpg",
    width: 1080,
    height: 1346,
    alt: "Spider-Man crouching in the rain in a comic-book illustration",
  },
  {
    id: "me-lanterns",
    kind: "image",
    title: "Lanterns outside the izakaya",
    description: "Warm paper lanterns on a dark Tokyo street.",
    source: "Downloads",
    tags: ["photography", "japan", "night"],
    file: "compressO-6270CBFE-632E-481D-BBE4-D1654635C2E8.jpg",
    width: 6000,
    height: 4000,
    alt: "Glowing Japanese lanterns outside a restaurant at night",
  },
  {
    id: "me-blossoms",
    kind: "image",
    title: "Cherry blossoms, close up",
    description: "Full bloom, almost too pink to be real.",
    source: "Downloads",
    tags: ["photography", "spring"],
    file: "compressO-6E4DB3C2-1738-4956-B1EA-F7B118DA49FD.jpg",
    width: 4000,
    height: 6000,
    alt: "Close-up of bright pink cherry blossoms on a branch",
  },
  {
    id: "me-clip",
    kind: "video",
    title: "Saved clip",
    description: "A 10-second clip from my downloads.",
    source: "Downloads",
    tags: ["video"],
    file: "saved-clip.mp4",
    width: 1280,
    height: 720,
    alt: "A saved video clip",
  },
  {
    id: "me-fuji-maple",
    kind: "image",
    title: "Fuji through red maples",
    description: "Autumn framing the mountain perfectly.",
    source: "Downloads",
    tags: ["photography", "japan", "landscape"],
    file: "compressO-BE4813D8-0629-4E79-8DB4-E32B76874B84.jpg",
    width: 3837,
    height: 5756,
    alt: "Mount Fuji seen through red autumn maple leaves",
  },
  {
    id: "me-anime-girl",
    kind: "image",
    title: "Uniform sketch",
    description: "Blonde anime character in a school uniform.",
    source: "Downloads",
    tags: ["anime", "illustration"],
    file: "compressO-IMG_3865.jpg",
    width: 1080,
    height: 1920,
    alt: "Anime illustration of a blonde girl in a school uniform",
  },
  {
    id: "me-shoreline",
    kind: "image",
    title: "Where the waves land",
    description: "Aerial shot of surf washing over dark sand.",
    source: "Downloads",
    tags: ["photography", "ocean", "aerial"],
    file: "compressO-D7CF964F-BD6F-427D-BABC-DAF4A39FAAB8.jpg",
    width: 2334,
    height: 2917,
    alt: "Aerial view of ocean waves washing over a shoreline",
  },
  {
    id: "me-optimus",
    kind: "image",
    title: "Optimus Prime",
    description: "Battle-worn and glowing.",
    source: "Downloads",
    tags: ["movies", "poster", "reference"],
    file: "compressO-IMG_4633.jpg",
    width: 640,
    height: 960,
    alt: "Optimus Prime from Transformers surrounded by firelight",
  },
  {
    id: "me-canyon",
    kind: "image",
    title: "Red rock country",
    description: "Ochre cliffs and scrub, somewhere dry and quiet.",
    source: "Downloads",
    tags: ["photography", "landscape"],
    file: "compressO-F5D0F587-A884-4510-BCE5-4D0E04308D62.jpg",
    width: 4000,
    height: 6000,
    alt: "Red and orange rock formations in a desert canyon",
  },
  {
    id: "me-batman",
    kind: "image",
    title: "Batman on the bike",
    description: "Minimal poster, all ink and red.",
    source: "Downloads",
    tags: ["movies", "poster", "reference"],
    file: "compressO-IMG_4634.jpg",
    width: 1080,
    height: 1920,
    alt: "Stylized Batman motorcycle poster with vertical title text",
  },
  {
    id: "me-branch",
    kind: "image",
    title: "First blossom",
    description: "One white branch against the green blur.",
    source: "Downloads",
    tags: ["photography", "spring"],
    file: "compressO-9BCD88C1-AFC4-483B-9A33-7C6F292BFBB2.jpg",
    width: 2832,
    height: 4248,
    alt: "A branch of small white blossoms against a soft green background",
  },
  {
    id: "me-anime-boy",
    kind: "image",
    title: "Track jacket",
    description: "Anime character adjusting his collar.",
    source: "Downloads",
    tags: ["anime", "illustration"],
    file: "compressO-IMG_3921.jpg",
    width: 1200,
    height: 1991,
    alt: "Anime illustration of a boy in a black and orange track jacket",
  },
  {
    id: "me-building",
    kind: "image",
    title: "The brick corner",
    description: "A historic corner building looking over the street.",
    source: "Downloads",
    tags: ["photography", "architecture", "city"],
    file: "compressO-A247AFD7-6871-4B6B-98B7-CDD69736409F.jpg",
    width: 3930,
    height: 5895,
    alt: "A historic brick corner building in a city street",
  },
  {
    id: "me-spidey-mask",
    kind: "image",
    title: "Eye lenses",
    description: "Extreme close-up on the mask.",
    source: "Downloads",
    tags: ["movies", "wallpaper"],
    file: "compressO-IMG_4632.jpg",
    width: 623,
    height: 1350,
    alt: "Close-up of Spider-Man's mask and eye lens",
  },
  {
    id: "me-valley",
    kind: "image",
    title: "River through the valley",
    description: "Green ridges and a winding river below.",
    source: "Camera roll",
    tags: ["photography", "landscape"],
    file: "compressO-IMG_2618.jpg",
    width: 1080,
    height: 1920,
    alt: "A river winding through a green mountain valley",
  },
  {
    id: "me-fort",
    kind: "image",
    title: "The fort on the water",
    description: "Stone walls right at the edge of the sea.",
    source: "Downloads",
    tags: ["photography", "travel"],
    file: "compressO-BD0448C2-54B5-4791-B6EF-05629CA6C40C.jpg",
    width: 1967,
    height: 2934,
    alt: "A historic stone fort sitting in the sea near the shore",
  },
  {
    id: "me-mockups",
    kind: "image",
    title: "Music app screens",
    description: "Five phone mockups with different player themes.",
    source: "Camera roll",
    tags: ["ui", "reference", "design"],
    file: "compressO-IMG_4637.jpg",
    width: 2000,
    height: 2000,
    alt: "Five phone mockups showing colorful music player designs",
  },
  {
    id: "me-cliffs",
    kind: "image",
    title: "Cliffs at golden hour",
    description: "The coast glowing before sunset.",
    source: "Downloads",
    tags: ["photography", "ocean", "travel"],
    file: "compressO-D2BD78FD-1D0F-4124-BAF0-C65065F12791.jpg",
    width: 4000,
    height: 6000,
    alt: "Sunlit coastal cliffs above the ocean at sunset",
  },
  {
    id: "me-shark",
    kind: "image",
    title: "Shark, passing by",
    description: "Underwater and unbothered.",
    source: "Camera roll",
    tags: ["photography", "ocean", "wildlife"],
    file: "compressO-IMG_4635.jpg",
    width: 736,
    height: 1308,
    alt: "A shark swimming underwater",
  },
  {
    id: "me-silk",
    kind: "image",
    title: "Black silk",
    description: "Dark abstract wallpaper material.",
    source: "Camera roll",
    tags: ["abstract", "wallpaper"],
    file: "compressO-IMG_4630.jpg",
    width: 650,
    height: 1156,
    alt: "Abstract black silk-like waves",
  },
  {
    id: "me-film-still",
    kind: "image",
    title: "Period film still",
    description: "Three men in vintage dress, mid-conversation.",
    source: "Camera roll",
    tags: ["movies", "reference"],
    file: "compressO-IMG_4636.jpg",
    width: 736,
    height: 485,
    alt: "Three men in period costume standing outdoors in a film still",
  },
  {
    id: "me-icons",
    kind: "image",
    title: "Icon set exploration",
    description: "Weather and action icons in a few colorways.",
    source: "Camera roll",
    tags: ["ui", "reference", "design"],
    file: "compressO-IMG_4638.jpg",
    width: 1200,
    height: 672,
    alt: "A grid of app icons in different styles and colors",
  },
  {
    id: "me-f1",
    kind: "image",
    title: "Remaining races",
    description: "Night-race graphic counting down the season.",
    source: "Camera roll",
    tags: ["racing", "reference", "design"],
    file: "compressO-IMG_4640.jpg",
    width: 1080,
    height: 1350,
    alt: "A night racing graphic reading remaining races",
  },
];

const day = 24 * 60 * 60 * 1000;
const base = Date.now() - 30 * 60 * 1000;

const card = (
  index: number,
  fields: Partial<LibraryCard> & Pick<LibraryCard, "id" | "kind" | "title">,
  metadata: LibraryCard["metadata"] = {},
): LibraryCard => ({
  description: null,
  sourceUrl: null,
  sourceLabel: null,
  localAssetPath: null,
  thumbnailPath: null,
  ocrText: "",
  createdAt: base - Math.floor(index / 2) * day,
  archived: false,
  hasArticleContent: false,
  ...fields,
  metadata,
});

const personalCards = personal.map((row, index) =>
  card(
    index,
    {
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      sourceLabel: row.source,
      localAssetPath: file(row.file),
      thumbnailPath: row.kind === "image" ? file(row.file) : null,
    },
    { tags: row.tags, mediaWidth: row.width, mediaHeight: row.height },
  ),
);

const keepers = [
  card(
    3,
    {
      id: "5",
      kind: "url",
      title: "The first post on Twitter",
      description: "A two-word product launch document from the first day of Twitter.",
      sourceUrl: "https://x.com/jack/status/20",
      sourceLabel: "X",
    },
    {
      tags: ["twitter", "history", "post"],
      social: {
        provider: "x",
        postUrl: "https://x.com/jack/status/20",
        postId: "20",
        authorName: "jack",
        authorHandle: "jack",
        text: "just setting up my twttr",
        publishedDate: "2006-03-21T20:50:14.000Z",
      },
    },
  ),
  card(
    9,
    {
      id: "10",
      kind: "pdf",
      title: "Attention Is All You Need.pdf",
      description:
        "The transformer paper. Eight authors, one architecture, and the beginning of everything since.",
      sourceUrl: "https://arxiv.org/abs/1706.03762",
      sourceLabel: "arXiv",
    },
    { tags: ["research", "ml"], pdfPageCount: 15 },
  ),
  card(
    1,
    {
      id: "12",
      kind: "note",
      title: "Books to reread this fall",
      description:
        "Pilgrim at Tinker Creek, The Design of Everyday Things, Seeing Like a State. Start with the Dillard.",
    },
    { tags: ["books", "life"] },
  ),
  card(
    5,
    {
      id: "13",
      kind: "quote",
      title: "“It is not that we have a short time to live, but that we waste a lot of it.”",
      description: "— Seneca",
      sourceUrl: "https://en.wikisource.org/wiki/Of_The_Shortness_of_Life/Chapter_1",
      sourceLabel: "On the Shortness of Life",
    },
    { tags: ["writing", "time"] },
  ),
];

// Kinds the demo seed has no example of.
const extras = [
  card(
    2,
    {
      id: "preview-article",
      kind: "article",
      title: "The Hundred-Year Language",
      description: "What programming languages will look like in a hundred years.",
      sourceUrl: "https://paulgraham.com/hundred.html",
      sourceLabel: "paulgraham.com",
      hasArticleContent: true,
    },
    { tags: ["essay", "programming"], readingMinutes: 14 },
  ),
  card(
    7,
    {
      id: "preview-article-image",
      kind: "article",
      title: "Notes on a quiet harbor town",
      description: "A slow travel piece about a fortress, a lighthouse and the tide.",
      sourceUrl: "https://example.com/travel/harbor-town",
      sourceLabel: "example.com",
      thumbnailPath: file("compressO-BD0448C2-54B5-4791-B6EF-05629CA6C40C.jpg"),
      hasArticleContent: true,
    },
    { tags: ["essay", "travel"], readingMinutes: 6 },
  ),
  card(
    11,
    {
      id: "preview-file",
      kind: "file",
      title: "household-budget-2026.xlsx",
      sourceLabel: "Downloads",
    },
    { tags: ["finance"], fileSizeBytes: 48_213 },
  ),
  card(
    13,
    {
      id: "preview-video-link",
      kind: "article",
      title: "Bret Victor — Inventing on Principle",
      description:
        "A talk about tools that give creators an immediate connection to what they make.",
      sourceUrl: "https://www.youtube.com/watch?v=PUv66718DII",
      sourceLabel: "youtube.com",
    },
    { tags: ["talk", "design"], mediaWidth: 480, mediaHeight: 360 },
  ),
];

/** Newest first, the way the library sends a page. */
export const seedCards: LibraryCard[] = [...personalCards, ...keepers, ...extras].sort(
  (a, b) => b.createdAt - a.createdAt,
);

export const seedArchived: LibraryCard[] = keepers
  .filter((item) => ["10", "12", "5"].includes(item.id))
  .map((item) => ({ ...item, id: `archive-${item.id}`, archived: true }));

export const seedBodies: Record<string, string> = {
  "12": "# Books to reread this fall\n\n- [ ] Pilgrim at Tinker Creek\n- [ ] The Design of Everyday Things\n- [ ] Seeing Like a State\n\nStart with the Dillard.",
};

export const seedSpaces: Space[] = [
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

export const seedMembership: Record<string, string[]> = {
  "seed-weekend-reading": ["5", "13"],
};

/** One card mid-processing and one with a failed job, so both states show in the preview. */
export const seedJobs = { processing: "preview-article", failed: "preview-file" };
