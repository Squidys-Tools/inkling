import demo from "./demo.json";

// `cell` is the photo's place in media/library.jpg, a 3 × 3 sheet of 3:4 thumbnails,
// so the whole grid is one request.
export type PlainsItem =
  | { id: string; kind: "photo"; title: string; cell: number }
  | { id: string; kind: "note"; title: string; words: number };

const items: Record<string, PlainsItem> = {
  blackDog: { id: "black-dog", kind: "photo", title: "A black dog, taking a break", cell: 0 },
  bear: { id: "bear", kind: "photo", title: "A bear by the water", cell: 1 },
  jellyfish: { id: "jellyfish", kind: "photo", title: "A jellyfish in deep blue", cell: 2 },
  pug: { id: "pug", kind: "photo", title: "The blanket belongs to the pug", cell: 3 },
  lion: { id: "lion", kind: "photo", title: "Lion, up close", cell: 4 },
  walrus: { id: "walrus", kind: "photo", title: "A slow afternoon", cell: 5 },
  beachDog: { id: "beach-dog", kind: "photo", title: "Last light at the beach", cell: 6 },
  lake: { id: "lake", kind: "photo", title: "The boat on the lake", cell: 7 },
  cafe: { id: "cafe", kind: "photo", title: "Coffee before the train", cell: 8 },
  tiny: { id: "note-tiny", kind: "note", title: "Tiny things worth keeping", words: 11 },
  weekend: { id: "note-weekend", kind: "note", title: "A weekend by the water", words: 14 },
  design: { id: "note-design", kind: "note", title: "Design thoughts", words: 16 },
};

const { blackDog, bear, jellyfish, pug, lion, walrus, beachDog, lake, cafe } = items;
const { tiny, weekend, design } = items;

/** The masonry lanes, laid out by hand so the match sits in view on both screens. */
export const lanes = {
  desktop: [
    [blackDog, tiny, lake, lion],
    [weekend, beachDog, pug, cafe],
    [walrus, design, jellyfish, bear],
  ],
  phone: [
    [blackDog, beachDog, tiny, lion, lake],
    [walrus, weekend, pug, cafe, jellyfish],
  ],
} satisfies Record<string, PlainsItem[][]>;

export const spaces = [
  { name: "Out in nature", color: "green", count: 4 },
  { name: "Read later", color: "blue", count: 0 },
  { name: "Little favourites", color: "pink", count: 3 },
] as const;

export const total = Object.keys(items).length;

/** The scripted search: what gets typed, the result that lifts and the near misses. */
export const search = demo;
