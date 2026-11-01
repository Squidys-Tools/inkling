import type { Space } from "@inkling/contracts";

// The demo library's records as data, with file names instead of bundler URLs:
// the web preview (./seed.ts) projects them into cards, and tools/dev writes
// them into a real SQLite library, so both dev modes show the same seed.

export type SeedItem = {
  id: string;
  kind: string;
  title: string;
  description?: string;
  source?: string;
  sourceUrl?: string;
  /** A seed-demo file kept as the item's asset, and for images its thumbnail. */
  file?: string;
  /** A seed-demo file used only as the thumbnail. */
  thumbnailFile?: string;
  hasArticleContent?: boolean;
  /** Also appears once more, archived, as `archive-<id>`. */
  archivedCopy?: boolean;
  /** Stagger slot: createdAt = base - floor(index / 2) days. */
  index: number;
  metadata?: Record<string, unknown>;
};

export const seedItems: SeedItem[] = [
  {
    id: "me-fuji-night",
    kind: "image",
    title: "The Matterhorn over the village lights",
    description: "Nightfall with Zermatt glowing below the mountain.",
    source: "Downloads",
    file: "compressO-6248AFB9-CEA1-45EE-944A-06CD88501EF8.jpg",
    index: 0,
    metadata: {
      tags: ["photography", "alps", "landscape", "night"],
      mediaWidth: 4000,
      mediaHeight: 6000,
    },
  },
  {
    id: "me-spidey-rain",
    kind: "image",
    title: "Spider-Man in the rain",
    description: "Crouched on a gargoyle, rain coming down hard.",
    source: "Downloads",
    file: "compressO-IMG_4631.jpg",
    index: 1,
    metadata: { tags: ["comics", "wallpaper"], mediaWidth: 1080, mediaHeight: 1346 },
  },
  {
    id: "me-lanterns",
    kind: "image",
    title: "Lanterns outside the izakaya",
    description: "Warm paper lanterns on a dark Tokyo street.",
    source: "Downloads",
    file: "compressO-6270CBFE-632E-481D-BBE4-D1654635C2E8.jpg",
    index: 2,
    metadata: { tags: ["photography", "japan", "night"], mediaWidth: 6000, mediaHeight: 4000 },
  },
  {
    id: "me-blossoms",
    kind: "image",
    title: "Cherry blossoms, close up",
    description: "Full bloom, almost too pink to be real.",
    source: "Downloads",
    file: "compressO-6E4DB3C2-1738-4956-B1EA-F7B118DA49FD.jpg",
    index: 3,
    metadata: { tags: ["photography", "spring"], mediaWidth: 4000, mediaHeight: 6000 },
  },
  {
    id: "me-clip",
    kind: "video",
    title: "Saved clip",
    description: "A 10-second clip from my downloads.",
    source: "Downloads",
    file: "saved-clip.mp4",
    index: 4,
    metadata: { tags: ["video"], mediaWidth: 1280, mediaHeight: 720 },
  },
  {
    id: "me-fuji-maple",
    kind: "image",
    title: "Fuji through red maples",
    description: "Autumn framing the mountain perfectly.",
    source: "Downloads",
    file: "compressO-BE4813D8-0629-4E79-8DB4-E32B76874B84.jpg",
    index: 5,
    metadata: {
      tags: ["photography", "japan", "landscape"],
      mediaWidth: 3837,
      mediaHeight: 5756,
    },
  },
  {
    id: "me-anime-girl",
    kind: "image",
    title: "Uniform sketch",
    description: "Blonde anime character in a school uniform.",
    source: "Downloads",
    file: "compressO-IMG_3865.jpg",
    index: 6,
    metadata: { tags: ["anime", "illustration"], mediaWidth: 1080, mediaHeight: 1920 },
  },
  {
    id: "me-shoreline",
    kind: "image",
    title: "Where the waves land",
    description: "Aerial shot of surf washing over dark sand.",
    source: "Downloads",
    file: "compressO-D7CF964F-BD6F-427D-BABC-DAF4A39FAAB8.jpg",
    index: 7,
    metadata: {
      tags: ["photography", "ocean", "aerial"],
      mediaWidth: 2334,
      mediaHeight: 2917,
    },
  },
  {
    id: "me-optimus",
    kind: "image",
    title: "Optimus Prime",
    description: "Battle-worn and glowing.",
    source: "Downloads",
    file: "compressO-IMG_4633.jpg",
    index: 8,
    metadata: {
      tags: ["movies", "poster", "reference"],
      mediaWidth: 640,
      mediaHeight: 960,
    },
  },
  {
    id: "me-canyon",
    kind: "image",
    title: "Red rock country",
    description: "Ochre cliffs and scrub, somewhere dry and quiet.",
    source: "Downloads",
    file: "compressO-F5D0F587-A884-4510-BCE5-4D0E04308D62.jpg",
    index: 9,
    metadata: {
      tags: ["photography", "landscape"],
      mediaWidth: 4000,
      mediaHeight: 6000,
    },
  },
  {
    id: "me-batman",
    kind: "image",
    title: "Batman on the bike",
    description: "Minimal poster, all ink and red.",
    source: "Downloads",
    file: "compressO-IMG_4634.jpg",
    index: 10,
    metadata: {
      tags: ["movies", "poster", "reference"],
      mediaWidth: 1080,
      mediaHeight: 1920,
    },
  },
  {
    id: "me-branch",
    kind: "image",
    title: "First blossom",
    description: "One white branch against the green blur.",
    source: "Downloads",
    file: "compressO-9BCD88C1-AFC4-483B-9A33-7C6F292BFBB2.jpg",
    index: 11,
    metadata: {
      tags: ["photography", "spring"],
      mediaWidth: 2832,
      mediaHeight: 4248,
    },
  },
  {
    id: "me-anime-boy",
    kind: "image",
    title: "Track jacket",
    description: "Anime character adjusting his collar.",
    source: "Downloads",
    file: "compressO-IMG_3921.jpg",
    index: 12,
    metadata: { tags: ["anime", "illustration"], mediaWidth: 1200, mediaHeight: 1991 },
  },
  {
    id: "me-building",
    kind: "image",
    title: "The brick corner",
    description: "A historic corner building looking over the street.",
    source: "Downloads",
    file: "compressO-A247AFD7-6871-4B6B-98B7-CDD69736409F.jpg",
    index: 13,
    metadata: {
      tags: ["photography", "architecture", "city"],
      mediaWidth: 3930,
      mediaHeight: 5895,
    },
  },
  {
    id: "me-spidey-mask",
    kind: "image",
    title: "Eye lenses",
    description: "Extreme close-up on the mask.",
    source: "Downloads",
    file: "compressO-IMG_4632.jpg",
    index: 14,
    metadata: { tags: ["movies", "wallpaper"], mediaWidth: 623, mediaHeight: 1350 },
  },
  {
    id: "me-valley",
    kind: "image",
    title: "River through the valley",
    description: "Green ridges and a winding river below.",
    source: "Camera roll",
    file: "compressO-IMG_2618.jpg",
    index: 15,
    metadata: { tags: ["photography", "landscape"], mediaWidth: 1080, mediaHeight: 1920 },
  },
  {
    id: "me-fort",
    kind: "image",
    title: "The fort on the water",
    description: "Stone walls right at the edge of the sea.",
    source: "Downloads",
    file: "compressO-BD0448C2-54B5-4791-B6EF-05629CA6C40C.jpg",
    index: 16,
    metadata: { tags: ["photography", "travel"], mediaWidth: 1967, mediaHeight: 2934 },
  },
  {
    id: "me-mockups",
    kind: "image",
    title: "Music app screens",
    description: "Five phone mockups with different player themes.",
    source: "Camera roll",
    file: "compressO-IMG_4637.jpg",
    index: 17,
    metadata: { tags: ["ui", "reference", "design"], mediaWidth: 2000, mediaHeight: 2000 },
  },
  {
    id: "me-cliffs",
    kind: "image",
    title: "Cliffs at golden hour",
    description: "The coast glowing before sunset.",
    source: "Downloads",
    file: "compressO-D2BD78FD-1D0F-4124-BAF0-C65065F12791.jpg",
    index: 18,
    metadata: { tags: ["photography", "ocean", "travel"], mediaWidth: 4000, mediaHeight: 6000 },
  },
  {
    id: "me-shark",
    kind: "image",
    title: "Shark, passing by",
    description: "Underwater and unbothered.",
    source: "Camera roll",
    file: "compressO-IMG_4635.jpg",
    index: 19,
    metadata: { tags: ["photography", "ocean", "wildlife"], mediaWidth: 736, mediaHeight: 1308 },
  },
  {
    id: "me-silk",
    kind: "image",
    title: "Black silk",
    description: "Dark abstract wallpaper material.",
    source: "Camera roll",
    file: "compressO-IMG_4630.jpg",
    index: 20,
    metadata: { tags: ["abstract", "wallpaper"], mediaWidth: 650, mediaHeight: 1156 },
  },
  {
    id: "me-film-still",
    kind: "image",
    title: "Period film still",
    description: "Three men in vintage dress, mid-conversation.",
    source: "Camera roll",
    file: "compressO-IMG_4636.jpg",
    index: 21,
    metadata: { tags: ["movies", "reference"], mediaWidth: 736, mediaHeight: 485 },
  },
  {
    id: "me-icons",
    kind: "image",
    title: "Icon set exploration",
    description: "Weather and action icons in a few colorways.",
    source: "Camera roll",
    file: "compressO-IMG_4638.jpg",
    index: 22,
    metadata: { tags: ["ui", "reference", "design"], mediaWidth: 1200, mediaHeight: 672 },
  },
  {
    id: "me-f1",
    kind: "image",
    title: "Remaining races",
    description: "Night-race graphic counting down the season.",
    source: "Camera roll",
    file: "compressO-IMG_4640.jpg",
    index: 23,
    metadata: { tags: ["racing", "reference", "design"], mediaWidth: 1080, mediaHeight: 1350 },
  },
  {
    id: "5",
    kind: "url",
    title: "The first post on Twitter",
    description: "A two-word product launch document from the first day of Twitter.",
    source: "X",
    sourceUrl: "https://x.com/jack/status/20",
    archivedCopy: true,
    index: 3,
    metadata: {
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
  },
  {
    id: "10",
    kind: "pdf",
    title: "Attention Is All You Need.pdf",
    description:
      "The transformer paper. Eight authors, one architecture, and the beginning of everything since.",
    source: "arXiv",
    sourceUrl: "https://arxiv.org/abs/1706.03762",
    archivedCopy: true,
    index: 9,
    metadata: { tags: ["research", "ml"], pdfPageCount: 15 },
  },
  {
    id: "12",
    kind: "note",
    title: "Books to reread this fall",
    description:
      "Pilgrim at Tinker Creek, The Design of Everyday Things, Seeing Like a State. Start with the Dillard.",
    archivedCopy: true,
    index: 1,
    metadata: { tags: ["books", "life"] },
  },
  {
    id: "13",
    kind: "quote",
    title: "“It is not that we have a short time to live, but that we waste a lot of it.”",
    description: "— Seneca",
    source: "On the Shortness of Life",
    sourceUrl: "https://en.wikisource.org/wiki/Of_The_Shortness_of_Life/Chapter_1",
    index: 5,
    metadata: { tags: ["writing", "time"] },
  },
  {
    id: "preview-article",
    kind: "article",
    title: "The Hundred-Year Language",
    description: "What programming languages will look like in a hundred years.",
    source: "paulgraham.com",
    sourceUrl: "https://paulgraham.com/hundred.html",
    hasArticleContent: true,
    index: 2,
    metadata: { tags: ["essay", "programming"], readingMinutes: 14 },
  },
  {
    id: "preview-article-image",
    kind: "article",
    title: "Notes on a quiet harbor town",
    description: "A slow travel piece about a fortress, a lighthouse and the tide.",
    source: "example.com",
    sourceUrl: "https://example.com/travel/harbor-town",
    thumbnailFile: "compressO-BD0448C2-54B5-4791-B6EF-05629CA6C40C.jpg",
    hasArticleContent: true,
    index: 7,
    metadata: { tags: ["essay", "travel"], readingMinutes: 6 },
  },
  {
    id: "preview-file",
    kind: "file",
    title: "household-budget-2026.xlsx",
    source: "Downloads",
    index: 11,
    metadata: { tags: ["finance"], fileSizeBytes: 48_213 },
  },
  {
    id: "preview-video-link",
    kind: "article",
    title: "Bret Victor — Inventing on Principle",
    description: "A talk about tools that give creators an immediate connection to what they make.",
    source: "youtube.com",
    sourceUrl: "https://www.youtube.com/watch?v=PUv66718DII",
    index: 13,
    metadata: { tags: ["talk", "design"], mediaWidth: 480, mediaHeight: 360 },
  },
];

export const seedBodies: Record<string, string> = {
  "12": "# Books to reread this fall\n\n- [ ] Pilgrim at Tinker Creek\n- [ ] The Design of Everyday Things\n- [ ] Seeing Like a State\n\nStart with the Dillard.",
};

// Article HTML for the reader, which the library keeps off the card and the item record.
export const seedArticles: Record<string, string> = {
  "preview-article-image": [
    '<p class="article-lede">The fortress wall still holds the harbor, though the guns are long gone.</p>',
    "<p>Mornings start at the lighthouse, where the tide decides how far you can walk. By noon the fishing boats are in and the town smells of salt and diesel.</p>",
    "<h2>The walk to the light</h2>",
    "<p>A footpath runs along the breakwater. At low tide it is dry the whole way; at high tide the last stretch is a wade.</p>",
    '<figure><iframe src="https://www.youtube.com/watch?v=PUv66718DII" title="A harbor at dawn"></iframe><figcaption>Footage the writer linked from the piece.</figcaption></figure>',
    "<blockquote><p>Nothing here hurries, except the tide.</p></blockquote>",
    "<p>Evenings belong to the square, where the café tables spill over the cobbles and nobody checks the time.</p>",
  ].join(""),
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
