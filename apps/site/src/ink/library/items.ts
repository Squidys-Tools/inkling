export type Photo = { kind: "photo"; src: string; alt: string; aspect: number };
export type Writing =
  | { kind: "quote"; text: string; author: string }
  | { kind: "article"; title: string; domain: string }
  | { kind: "note"; title: string };
export type Saved = Photo | Writing;

const photo = (name: string, alt: string, width: number, height: number): Photo => ({
  kind: "photo",
  src: `/media/ink/library/${name}.webp`,
  alt,
  aspect: width / height,
});

// Order is depth order: the first item floats nearest the surface.
export const savedItems: Saved[] = [
  photo("fuji-maples", "Mount Fuji framed by red maples", 373, 560),
  photo("izakaya-lanterns", "Paper lanterns over an izakaya at night", 480, 320),
  {
    kind: "quote",
    text: "It is not that we have a short time to live, but that we waste a lot of it.",
    author: "Seneca",
  },
  photo("cherry-blossoms", "Pink cherry blossoms on a branch", 373, 560),
  photo("bear", "A brown bear on a rocky slope", 420, 560),
  photo("matterhorn-night", "The Matterhorn above a village at night", 373, 560),
  photo("waves", "Surf seen from above", 448, 560),
  { kind: "article", title: "The Hundred-Year Language", domain: "paulgraham.com" },
  photo("flatiron", "A brick corner building between towers", 373, 560),
  photo("walrus", "Walruses resting on a beach", 420, 560),
  photo("pug", "A pug wrapped in a blanket", 420, 560),
  photo("spiderman-rain", "Spider-Man crouched in the rain, poster art", 449, 560),
  photo("branch", "A bare branch against green blur", 373, 560),
  photo("red-rock", "Red rock cliffs under pines", 373, 560),
  photo("belem-tower", "A stone tower on the water", 375, 560),
  { kind: "note", title: "Books to reread this fall" },
  photo("ink-smoke", "Black smoke curling on a dark ground", 315, 560),
  photo("lioness", "A lioness looking straight ahead", 420, 560),
  photo("uniform-sketch", "A sketch of a character in a track jacket", 315, 560),
  photo("coast", "A cliff town above the sea", 373, 560),
  photo("puppy", "A black puppy looking up", 420, 560),
  photo("silk", "Grey silk folds", 315, 560),
  photo("valley", "A river valley between mountains", 315, 560),
];
