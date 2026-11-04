import type { Job, Space } from "@inkling/contracts";
import type { SeedItem } from "../seed-data.ts";

// The site demo's library (`vite build --mode site`). The marketing site may
// publish every photo here: each is an Unsplash photo with its credit, and the
// site's /credits page lists them. The dev seed's photos are not cleared for that.

const photo = (
  index: number,
  id: number,
  title: string,
  description: string,
  tags: string[],
  credit: SeedItem["credit"],
): SeedItem => ({
  id: `photo-${id}`,
  kind: "image",
  title,
  description,
  source: "Photo collection",
  file: `animal-${id}.jpg`,
  credit,
  index,
  metadata: { tags, mediaWidth: 720, mediaHeight: 960 },
});

const note = (index: number, id: string, title: string, description: string, tags: string[]) => ({
  id,
  kind: "note",
  title,
  description,
  index,
  metadata: { tags },
});

const notes = [
  note(
    1,
    "note-tiny-things",
    "Tiny things worth keeping",
    "The sound of rain. A good paragraph. The long way home.",
    ["notes", "life"],
  ),
  note(
    3,
    "note-weekend",
    "A weekend by the water",
    "Bring a notebook, a camera and a warm layer. Leave room for the unplanned.",
    ["travel", "lake"],
  ),
  note(
    5,
    "note-design",
    "Design thoughts",
    "Let one thing lead. Make room for the words. Give the details a reason to exist.",
    ["design", "reference"],
  ),
  note(7, "note-slow-morning", "A recipe for a slow morning", "Coffee, toast, a book. No hurry.", [
    "recipe",
    "morning",
  ]),
  {
    ...note(
      9,
      "note-books",
      "Books for a quiet evening",
      "The Secret Garden\nThe Wind in the Willows\nA notebook of your own",
      ["books", "reading"],
    ),
    archivedCopy: true,
  },
  note(
    11,
    "note-ideas",
    "Good ideas turn up anywhere",
    "Keep them somewhere you can find them again.",
    ["ideas", "notes"],
  ),
];

export const seedItems: SeedItem[] = [
  photo(
    0,
    237,
    "A black dog, taking a break",
    "A curious black Labrador looking up from a wooden deck.",
    ["dog", "black", "wood", "animals"],
    { author: "André Spieker", url: "https://unsplash.com/photos/8wTPqxlnKM4" },
  ),
  photo(
    2,
    1069,
    "A jellyfish in deep blue",
    "An orange jellyfish moving through blue water.",
    ["jellyfish", "blue", "orange", "ocean"],
    { author: "Marat Gilyadzinov", url: "https://unsplash.com/photos/wpTWYBll4_w" },
  ),
  photo(
    4,
    1020,
    "A bear by the water",
    "A brown bear on rocky ground, snowy trees behind it.",
    ["bear", "lake", "nature", "mountains"],
    { author: "Adam Willoughby-Knox", url: "https://unsplash.com/photos/_snqARKTgoc" },
  ),
  photo(
    6,
    1025,
    "The blanket belongs to the pug",
    "A small pug wrapped up on a woodland walk.",
    ["dog", "pug", "blanket", "animals"],
    { author: "Matthew Wiebe", url: "https://unsplash.com/photos/U5rMrSI7Pn4" },
  ),
  photo(
    8,
    1074,
    "Lion, up close",
    "A lion looking straight at the camera.",
    ["lion", "wildlife", "portrait"],
    { author: "Samuel Scrimshaw", url: "https://unsplash.com/photos/sseiVD2XsOk" },
  ),
  photo(
    10,
    1084,
    "A slow afternoon",
    "Walruses resting together on a quiet beach.",
    ["walrus", "beach", "wildlife", "ocean"],
    { author: "Jay Ruzesky", url: "https://unsplash.com/photos/h13Y8vyIXNU" },
  ),
  ...notes,
  {
    id: "article-garden",
    kind: "article",
    title: "A little garden journal",
    description: "What grows when you give it time.",
    source: "Garden journal",
    thumbnailFile: "animal-1020.jpg",
    hasArticleContent: true,
    index: 13,
    metadata: { tags: ["garden", "reading"] },
  },
  {
    id: "quote-surprise",
    kind: "quote",
    title: "Keep a little room for a good surprise.",
    description: "A note to ourselves.",
    index: 14,
    metadata: { tags: ["life", "quote"] },
  },
];

export const seedBodies: Record<string, string> = Object.fromEntries(
  notes.map((item) => [item.id, `# ${item.title}\n\n${item.description}`]),
);

export const seedArticles: Record<string, string> = {
  "article-garden":
    "<h1>A little garden journal</h1><p>A quiet place to keep track of what is growing. Watch the light, leave room for new leaves, and write down the small changes.</p><h2>Start small</h2><p>A pot on the windowsill counts. So does a few minutes of attention.</p>",
};

const space = (
  position: number,
  id: string,
  name: string,
  color: Space["color"],
  tag?: string,
): Space => ({
  id,
  name,
  color,
  query: tag ? { tag } : {},
  kind: tag ? "smart" : "regular",
  position,
  createdAt: 0,
  updatedAt: 0,
});

export const seedSpaces: Space[] = [
  space(1, "space-nature", "Out in nature", "green", "nature"),
  space(2, "space-reading", "Read later", "blue", "reading"),
  space(3, "space-favourites", "Little favourites", "pink"),
];

export const seedMembership: Record<string, string[]> = {
  "space-favourites": ["photo-237", "note-tiny-things", "quote-surprise"],
};

export const seedJobs: { itemId: string; status: Job["status"] }[] = [];
