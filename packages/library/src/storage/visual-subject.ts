// Nomic text-to-image similarity is too small (about 0.05 to 0.09) for a fixed
// floor to tell a cat from a screenshot, so a Space named "Cats" labels each
// photo by its nearest prompt, a screenshot prompt and many unrelated subjects
// competing, and keeps the photos labelled with a wanted subject.

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

/** The prompt each label is embedded from, as a search query. */
export const subjectPrompt = (subject: string) => `a photo of a ${subject}`;
export const interfacePrompt = "a screenshot of a computer screen with text";
export const interfaceLabel = "interface";

/** Unlisted subjects that compete with the list, so a fox or a pizza is labelled
 *  as something else instead of being snapped into the nearest listed subject.
 *  Picked on real Nomic vectors: none of them outscores a listed subject on its
 *  own photos. Words that did (fox, truck, field, painting...) are left out. */
export const otherSubjects = [
  "person",
  "people",
  "baby",
  "child",
  "face",
  "selfie",
  "wedding",
  "food",
  "meal",
  "dish",
  "drink",
  "bread",
  "salad",
  "sushi",
  "soup",
  "bridge",
  "kitchen",
  "bedroom",
  "parking lot",
  "boat",
  "ship",
  "airplane",
  "helicopter",
  "bus",
  "motorcycle",
  "rocket",
  "lake",
  "waterfall",
  "ocean",
  "sky",
  "cloud",
  "sunset",
  "desert",
  "ice",
  "cave",
  "forest",
  "jungle",
  "bear",
  "lion",
  "tiger",
  "leopard",
  "giraffe",
  "zebra",
  "monkey",
  "gorilla",
  "deer",
  "cow",
  "sheep",
  "goat",
  "rabbit",
  "squirrel",
  "mouse",
  "hamster",
  "bat",
  "fish",
  "shark",
  "whale",
  "dolphin",
  "frog",
  "snake",
  "lizard",
  "insect",
  "butterfly",
  "bee",
  "spider",
  "crab",
  "object",
  "machine",
  "computer",
  "phone",
  "keyboard",
  "book",
  "toy",
  "doll",
  "furniture",
  "chair",
  "table",
  "sofa",
  "bed",
  "lamp",
  "bottle",
  "shoe",
  "bag",
  "clothing",
  "instrument",
  "guitar",
  "chart",
  "diagram",
  "sign",
  "logo",
  "pattern",
  "texture",
];

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

/** The subjects a query names when it is only a list of photographable nouns, else null:
 *  "Cats" and "photos of cats and dogs" qualify, "cat training notes" does not. */
export function visualSubjectQuery(text: string) {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => !framing.has(word),
  );
  if (!words.length || words.some((word) => !alias.has(word))) return null;
  return [...new Set(words.map((word) => alias.get(word)!))];
}

/** Prompt vectors keyed by label: the subjects, `interface` for the screenshot
 *  prompt, and every other subject. */
export type SubjectVectors = ReadonlyMap<string, ArrayLike<number>>;

function dot(left: ArrayLike<number>, right: ArrayLike<number>) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

/** The label whose prompt is nearest the image, and that similarity; null when no
 *  prompt shares the image's dimension. */
export function labelImage(image: ArrayLike<number>, prompts: SubjectVectors) {
  let best: { label: string; score: number } | null = null;
  for (const [label, prompt] of prompts) {
    if (prompt.length !== image.length) continue;
    const score = dot(prompt, image);
    if (!best || score > best.score) best = { label, score };
  }
  return best;
}

export function decodeVector(blob: Uint8Array, dimension: number) {
  if (blob.byteLength !== dimension * 4) return null;
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const vector = new Float32Array(dimension);
  for (let index = 0; index < dimension; index += 1)
    vector[index] = view.getFloat32(index * 4, true);
  return vector;
}
