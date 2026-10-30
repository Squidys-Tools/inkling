// Subject searches describe the picture, not words inside a captured interface.
// This is a conservative admission policy over local captions, not a new model
// or a claim that filename/OCR text can classify arbitrary pixels reliably.
const dogBreeds: Record<string, string[]> = {
  corgi: ["corgi", "corgis"],
  pomeranian: ["pomeranian", "pomeranians"],
  poodle: ["poodle", "poodles"],
  retriever: ["retriever", "retrievers"],
  labrador: ["labrador", "labradors"],
  husky: ["husky", "huskies"],
  terrier: ["terrier", "terriers"],
  bulldog: ["bulldog", "bulldogs"],
  shepherd: ["shepherd", "shepherds"],
};
const subjects: Record<string, string[]> = {
  cat: ["cat", "cats", "kitten", "kittens", "feline", "felines", "tabby", "tabbies", "siamese"],
  dog: ["dog", "dogs", "puppy", "puppies", "canine", "canines", ...Object.values(dogBreeds).flat()],
  // Later entries keep breed queries specific rather than expanding them to dog.
  ...dogBreeds,
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
  const explicitUi =
    /\bscreen\s*shot\b|\bscreenshots?\b|\b(?:computer|phone|dark|black)\s+screens?\b|\b(?:user interface|web\s?page|chat window)\b/i.test(
      caption,
    );
  // Physical buttons on clothing and religious icons are not UI evidence.
  const uiControls =
    /\b(?:icons?|buttons?)\b/i.test(caption) &&
    /\b(?:screen|display|interface|application|app|browser|menu|toolbar|dialog)\b/i.test(caption);
  if (explicitUi || uiControls) return "screenshot" as const;
  if (/\b(?:screen\s*shot|screenshot)\b/i.test(evidence.title) && !caption.trim())
    return "screenshot" as const;
  return caption.trim() ? ("photo" as const) : ("unknown" as const);
}

function visibleCaption(caption: string) {
  // Quoted/printed nouns and negated clauses are not affirmative evidence.
  // These bounded guards intentionally do not claim general language parsing.
  const unquoted = caption.replace(
    /"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|(?<![\p{L}])'[^'\n]*'(?![\p{L}])/gu,
    " ",
  );
  return unquoted
    .split(/[.!?;]|\b(?:but|however|whereas)\b/giu)
    .map((clause) => {
      let visible = clause.replace(
        /\b(?:no|not|without|neither|cannot|can't|isn't|aren't)\b.*$/giu,
        "",
      );
      if (/\b(?:printed|written|embroidered|depicted|illustrated)\b/i.test(visible)) {
        // "A cat wearing a shirt with dog printed on it" confirms the cat only;
        // "a cat printed on a shirt" confirms neither a live cat nor a dog.
        visible = visible.split(/\b(?:with|wearing|beside|next to)\b/iu)[0];
        if (/\b(?:printed|written|embroidered|depicted|illustrated)\b/i.test(visible)) return "";
      }
      return visible.replace(/\b(?:words?|text|lettering|labels?|reads|says|spells)\b.*$/giu, "");
    })
    .join(" ");
}
export function matchesVisualSubject(evidence: ImageEvidence, wanted: string[]) {
  if (classifyImage(evidence) !== "photo") return false;
  const visible = new Set(tokens(visibleCaption(evidence.caption ?? "")));
  return wanted.some((subject) => {
    if (subjects[subject]?.some((word) => visible.has(word))) return true;
    // A user-labelled breed may refine an already visually confirmed dog, but
    // a filename, OCR mention or user tag alone never creates a photo match.
    return (
      Boolean(dogBreeds[subject]) &&
      subjects.dog.some((word) => visible.has(word)) &&
      (evidence.tags ?? []).some((tag) => dogBreeds[subject].includes(tag.toLowerCase()))
    );
  });
}
