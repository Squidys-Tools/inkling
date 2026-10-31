// Which Smart Spaces collect photos of a subject ("Cats"). The library and the
// web preview both read this, so a Space means the same thing in either mode.

const subjectWords: Record<string, string[]> = {
  cat: ["cat", "cats", "kitten", "kittens", "kitty", "kitties", "feline", "felines"],
  dog: ["dog", "dogs", "puppy", "puppies", "doggy", "doggies", "canine", "canines"],
  bird: ["bird", "birds"],
  horse: ["horse", "horses", "pony", "ponies"],
  car: ["car", "cars", "automobile", "automobiles"],
  bicycle: ["bicycle", "bicycles", "bike", "bikes"],
  flower: ["flower", "flowers"],
  tree: ["tree", "trees"],
  mountain: ["mountain", "mountains"],
  beach: ["beach", "beaches"],
};

export const visualSubjects = Object.keys(subjectWords);

const framing = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "my",
  "photo",
  "photos",
  "picture",
  "pictures",
  "pic",
  "pics",
  "image",
  "images",
]);
const alias = new Map(
  Object.entries(subjectWords).flatMap(([subject, words]) =>
    words.map((word) => [word, subject] as const),
  ),
);

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]s\b/gu, "")
    .match(/[\p{L}\p{N}]+/gu) ?? [];

/** The subjects a query names when it is only a list of photographable nouns, else null:
 *  "Cats" and "photos of cats and dogs" qualify, "cat training notes" does not. */
export function visualSubjectQuery(text: string) {
  const nouns = words(text).filter((word) => !framing.has(word));
  if (!nouns.length || nouns.some((word) => !alias.has(word))) return null;
  return [...new Set(nouns.map((word) => alias.get(word)!))];
}

type SpaceShape = {
  kind: string;
  name: string;
  query: { text?: string | null; kind?: string | null; tag?: string | null };
};

/** The photo subjects a Smart Space collects, or null when it is an ordinary search.
 *  Its text names them, or, with no filters at all, its name ("Cats"); any other
 *  unfiltered Space still lists everything. A kind filter keeps the search textual,
 *  so notes appear only when asked for. The saved query is never rewritten. */
export function smartSpaceSubjects(space: SpaceShape) {
  const text = space.query.text?.trim();
  if (space.kind !== "smart" || space.query.kind?.trim()) return null;
  return visualSubjectQuery(text || (space.query.tag?.trim() ? "" : space.name));
}

/** Whether text, such as an image's title, OCR and tags, names one of the subjects
 *  as a whole word: the match for photos with no vision vector to judge them by. */
export function mentionsSubject(text: string, subjects: readonly string[]) {
  return words(text).some((word) => subjects.includes(alias.get(word) ?? ""));
}
