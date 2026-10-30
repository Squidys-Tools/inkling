// Subject searches describe the picture, not words inside a captured interface.
// This is a conservative admission policy over local captions, not a new model
// or a claim that filename/OCR text can classify arbitrary pixels reliably.
const subjects: Record<string, string[]> = {
  cat: ["cat", "cats", "kitten", "kittens", "feline", "tabby", "siamese"],
  dog: [
    "dog",
    "dogs",
    "puppy",
    "puppies",
    "canine",
    "corgi",
    "pomeranian",
    "poodle",
    "retriever",
    "labrador",
    "husky",
    "terrier",
    "bulldog",
    "shepherd",
  ],
  corgi: ["corgi", "corgis"],
  pomeranian: ["pomeranian", "pomeranians"],
  bird: ["bird", "birds", "parrot", "parrots", "sparrow", "sparrows", "eagle", "eagles"],
  horse: ["horse", "horses", "pony", "ponies"],
  car: ["car", "cars", "automobile", "automobiles"],
  bicycle: ["bicycle", "bicycles", "bike", "bikes"],
  flower: ["flower", "flowers", "rose", "roses", "tulip", "tulips"],
  tree: ["tree", "trees"],
  mountain: ["mountain", "mountains"],
  beach: ["beach", "beaches", "seashore"],
};
const tokens = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const framing = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "photo",
  "photos",
  "photograph",
  "photographs",
  "picture",
  "pictures",
  "image",
  "images",
  "show",
  "showing",
  "me",
]);
const alias = new Map(
  Object.entries(subjects).flatMap(([key, values]) => values.map((value) => [value, key] as const)),
);
// Breed terms retain their specificity even when also aliases of 'dog'.
alias.set("corgi", "corgi");
alias.set("corgis", "corgi");
alias.set("pomeranian", "pomeranian");
alias.set("pomeranians", "pomeranian");
export function visualSubjectQuery(query: string) {
  const words = tokens(query).filter((word) => !framing.has(word));
  if (!words.length || words.some((word) => !alias.has(word))) return null;
  return [...new Set(words.map((word) => alias.get(word)!))];
}
export type ImageEvidence = {
  caption: string | null;
  title: string;
  ocrText: string;
  tags?: string[];
};
export function classifyImage(evidence: ImageEvidence) {
  const caption = evidence.caption ?? "";
  // OCR is used only to recognize app chrome, NEVER to supply subject nouns.
  const ocr = evidence.ocrText.toLowerCase();
  const ownChrome = /\b(?:search|[bf]earch)\s+your\s*mind\b/.test(ocr);
  const ownGallery = /\beverything\b/.test(ocr) && /\b(?:inkling|1nkung)\b/.test(ocr);
  if (ownChrome || ownGallery) return "inkling-interface" as const;
  if (
    /\bscreen\s*shot\b|\bscreenshots?\b|\b(?:computer|phone|dark|black)\s+screens?\b|\b(?:icons?|buttons?|user interface|web\s?page|chat window)\b/i.test(
      caption,
    )
  )
    return "screenshot" as const;
  if (/\b(?:screen\s*shot|screenshot)\b/i.test(evidence.title) && !caption.trim())
    return "screenshot" as const;
  return caption.trim() ? ("photo" as const) : ("unknown" as const);
}
export function matchesVisualSubject(evidence: ImageEvidence, wanted: string[]) {
  if (classifyImage(evidence) !== "photo") return false;
  // Negated or incidental quoted words must not create a confident subject.
  const caption = (evidence.caption ?? "").replace(
    /\b(?:not|no|without)\s+(?:a\s+|any\s+)?[\p{L}]+/giu,
    "",
  );
  const visible = new Set(tokens(caption));
  return wanted.some((subject) => {
    if (subjects[subject]?.some((word) => visible.has(word))) return true;
    // A user-labelled breed may refine an already visually confirmed dog, but
    // a filename, OCR mention or user tag alone never creates a photo match.
    return (
      (subject === "corgi" || subject === "pomeranian") &&
      subjects.dog.some((word) => visible.has(word)) &&
      (evidence.tags ?? []).some((tag) => subjects[subject].includes(tag.toLowerCase()))
    );
  });
}
