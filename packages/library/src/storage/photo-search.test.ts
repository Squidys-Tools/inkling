import { afterAll, afterEach, expect, test } from "bun:test";
import type { LibraryCard } from "@inkling/contracts";
import { IMAGE_MODEL } from "@inkling/contracts/jobs";
import { closeAll, ids, removeTemporaryRoots, temporaryLibrary, vector } from "./test-helpers.ts";
import {
  photoSearchLabels,
  photoSearchScore,
  photoSearchSubjects,
  supplementPhotoMatches,
} from "./photo-search.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

const axis = (label: string, weight = 1, ...others: [string, number][]) => {
  const values = new Array(photoSearchLabels.length).fill(0);
  values[photoSearchLabels.indexOf(label)] = weight;
  for (const [name, value] of others) values[photoSearchLabels.indexOf(name)] = value;
  return values;
};
const prompts = new Map(photoSearchLabels.map((label) => [label, axis(label)]));

test("photo scores use prompt competition, not the incompatible text floor", () => {
  expect(photoSearchScore(axis("car", 0.06), ["car"], prompts)).toBeCloseTo(0.06);
  expect(photoSearchScore(axis("cat", 0.08), ["car"], prompts)).toBeNull();
  expect(photoSearchScore(axis("truck", 0.09, ["car", 0.06]), ["car"], prompts)).toBeNull();
  expect(photoSearchScore(axis("wolf", 0.09, ["dog", 0.055]), ["dog"], prompts)).toBeNull();
  // Small ambiguity preserves dogs whose image is very near the wolf prompt.
  expect(photoSearchScore(axis("wolf", 0.07, ["dog", 0.067]), ["dog"], prompts)).toBeCloseTo(0.067);
  expect(photoSearchScore(axis("interface", 0.08, ["cat", 0.079]), ["cat"], prompts)).toBeNull();
  expect(photoSearchScore(axis("cat", 0.08), ["cat"], new Map())).toBeNull();
  expect(photoSearchScore([1, 0], ["cat"], prompts)).toBeNull();
  expect(photoSearchScore(axis("cat", NaN), ["cat"], prompts)).toBeNull();
  const dynamic = new Map([...prompts].map(([label, values]) => [label, [...values, 0]]));
  dynamic.set("purple teapot", [...axis("car", 0), 1]);
  expect(
    photoSearchScore([...axis("food", 0.06), 0.08], ["purple teapot"], dynamic, false),
  ).toBeCloseTo(0.08);
  expect(
    photoSearchScore([...axis("food", 0.06), 0.064], ["purple teapot"], dynamic, false),
  ).toBeNull();
  dynamic.delete("phone");
  expect(
    photoSearchScore([...axis("food", 0.06), 0.08], ["purple teapot"], dynamic, false),
  ).toBeNull();
  expect(photoSearchSubjects(" Purple teapot ")).toEqual(["purple teapot"]);
  expect(photoSearchSubjects("photos of kittens and dogs")).toEqual(["cat", "dog"]);
  expect(photoSearchSubjects(" ")).toEqual([]);
});

test("visual supplements preserve exact OCR/text and semantic notes, deduplicate and cap", () => {
  const card = (id: string) => ({ id }) as LibraryCard;
  const ranked = [card("ocr"), card("semantic-note")];
  expect(ids(supplementPhotoMatches(ranked, [card("ocr"), card("visual-photo")]))).toEqual([
    "ocr",
    "semantic-note",
    "visual-photo",
  ]);
  expect(ids(supplementPhotoMatches(ranked, [card("visual-photo")], 2))).toEqual([
    "ocr",
    "semantic-note",
  ]);
});

test("unlisted photo queries compete with the guard prompts without relaxing known-noun recall", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items (id, kind, title, created_at, updated_at)
    VALUES (?, 'image', 'neutral', 1, 1)`);
  for (const subject of [
    "pizza",
    "rabbit",
    "shrimp",
    "cake",
    "lion",
    "motorcycle",
    "citrus",
    "purple teapot",
  ]) {
    insert.run(subject);
    const queryPrompts = new Map([...prompts].map(([label, values]) => [label, [...values, 0]]));
    const wanted = [...axis("car", 0), 1];
    queryPrompts.set(subject, wanted);
    await library.storeEmbedding(subject, "image", IMAGE_MODEL, vector(wanted), wanted.length);
    // An actual new query prompt wins its photograph; an absent query prompt cannot admit it.
    expect(ids(await library.searchPhotoSubjects(subject, 20, queryPrompts))).toContain(subject);
    await library.archiveItem(subject, true);
  }
});

test("only current active photo vectors supplement recognized noun searches", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db
    .prepare(`INSERT INTO items (id, kind, title, created_at, updated_at, archived)
    VALUES (?, ?, 'neutral', 1, ?, ?)`);
  for (const [id, kind, label, model, archived, updated] of [
    ["car", "image", "car", IMAGE_MODEL, 0, 1],
    ["cat", "image", "cat", IMAGE_MODEL, 0, 2],
    ["truck", "image", "truck", IMAGE_MODEL, 0, 3],
    ["screen", "image", "interface", IMAGE_MODEL, 0, 4],
    ["old", "image", "car", "old-model", 0, 5],
    ["archived", "image", "car", IMAGE_MODEL, 1, 6],
    ["note", "note", "car", IMAGE_MODEL, 0, 7],
  ] as const) {
    insert.run(id, kind, updated, archived);
    await library.storeEmbedding(
      id,
      "image",
      model,
      vector(axis(label, 0.07)),
      photoSearchLabels.length,
    );
  }
  insert.run("not-analyzed", "image", 8, 0);
  expect(ids(await library.searchPhotoSubjects("car", 20, prompts))).toEqual(["car"]);
  expect(ids(await library.searchPhotoSubjects("cats and cars", 20, prompts))).toEqual([
    "cat",
    "car",
  ]);
  expect(await library.searchPhotoSubjects("car maintenance notes", 20, prompts)).toEqual([]);
  expect(await library.searchPhotoSubjects("car", 20, null)).toEqual([]);
  await library.archiveItem("car", true);
  expect(await library.searchPhotoSubjects("car", 20, prompts)).toEqual([]);
  await library.storeEmbedding(
    "cat",
    "image",
    IMAGE_MODEL,
    vector(axis("car", 0.08)),
    photoSearchLabels.length,
  );
  expect(ids(await library.searchPhotoSubjects("car", 20, prompts))).toEqual(["cat"]);
  await library.archiveItem("cat", true);
  await library.deleteItem("cat");
  expect(await library.searchPhotoSubjects("car", 20, prompts)).toEqual([]);
});

test("visual candidates tied at the cap keep the newest", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items (id, kind, title, created_at, updated_at)
    VALUES (?, 'image', 'neutral', 1, ?)`);
  for (let index = 0; index < 8; index += 1) {
    const id = `image-${index}`;
    insert.run(id, index);
    await library.storeEmbedding(
      id,
      "image",
      IMAGE_MODEL,
      vector(axis("car", 0.06)),
      photoSearchLabels.length,
    );
  }
  expect(ids(await library.searchPhotoSubjects("car", 2, prompts))).toEqual(["image-7", "image-6"]);
});
