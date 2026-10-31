import { afterAll, afterEach, expect, test } from "bun:test";
import { IMAGE_MODEL, TEXT_MODEL } from "@inkling/contracts/jobs";
import { closeAll, ids, removeTemporaryRoots, temporaryLibrary, vector } from "./test-helpers.ts";
import { smartSpaceText } from "./spaces.ts";
import {
  interfaceLabel,
  labelImage,
  visualSubjectQuery,
  visualSubjects,
} from "./visual-subject.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

// One axis per label: a subject prompt points along its own axis, and an image is
// nearest the label it leans toward, as Nomic's real vectors do at a smaller scale.
const labels = [...visualSubjects, interfaceLabel];
const axis = (label: string, weight = 1) => {
  const values = new Array(labels.length).fill(0.01);
  values[labels.indexOf(label)] = weight;
  return values;
};
const prompts = new Map(labels.map((label) => [label, axis(label)]));

test("a subject query is a list of photographable nouns, not any text that mentions one", () => {
  expect(visualSubjectQuery("Cats")).toEqual(["cat"]);
  expect(visualSubjectQuery("photos of kittens and dogs")).toEqual(["cat", "dog"]);
  for (const text of ["cat training notes", "screenshot of a cat", "category", "Discord", ""])
    expect(visualSubjectQuery(text)).toBeNull();
  expect(labelImage(axis("cat", 0.09), prompts)?.label).toBe("cat");
  expect(labelImage([1, 0], prompts)).toBeNull();
});

test("an unfiltered Smart Space searches for its name without rewriting its saved query", () => {
  const space = { kind: "smart" as const, name: " Cats ", query: {} };
  expect(smartSpaceText(space)).toBe("Cats");
  expect(smartSpaceText({ ...space, query: { text: "tabby" } })).toBe("tabby");
  expect(smartSpaceText({ ...space, query: { tag: "pets" } })).toBe("");
  expect(smartSpaceText({ ...space, kind: "regular" })).toBe("");
});

test("a Space named Cats holds analyzed cat photos only, never screenshots, notes or pending images", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, ocr_text, metadata, created_at, updated_at, archived)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const image = async (id: string, label: string, weight: number, archived = 0) => {
    insert.run(id, "image", "neutral.png", "", '{"tags":["pets"]}', 1, 1, archived);
    await library.storeEmbedding(
      id,
      "image",
      IMAGE_MODEL,
      vector(axis(label, weight)),
      labels.length,
    );
  };
  await image("tabby", "cat", 0.09);
  await image("kitten", "cat", 0.05);
  await image("puppy", "dog", 0.08);
  // A screenshot of a chat about cats: its OCR and filename say cat, its pixels say screen.
  await image("chat-shot", interfaceLabel, 0.08);
  library.db
    .prepare("UPDATE items SET title = 'cat.png', ocr_text = 'cat cat cat' WHERE id = 'chat-shot'")
    .run();
  await image("archived-cat", "cat", 0.09, 1);
  insert.run("pending-cat", "image", "cat.png", "cat", "{}", 1, 1, 0);
  insert.run("old-model-cat", "image", "cat.png", "", "{}", 1, 1, 0);
  await library.storeEmbedding(
    "old-model-cat",
    "image",
    "nomic-embed-vision-v1.5",
    vector(axis("cat", 0.09)),
    labels.length,
  );
  insert.run("cat-note", "note", "my cat", "", "{}", 1, 1, 0);
  await library.storeEmbedding(
    "cat-note",
    "text",
    TEXT_MODEL,
    vector(axis("cat", 0.9)),
    labels.length,
  );

  const cats = await library.createSpace({ name: "Cats" });
  expect(cats.query).toEqual({});
  // Best match first; the Space shows nothing until the subject prompts exist.
  expect(ids(await library.listSpaceItems(cats.id, 100, null, prompts))).toEqual([
    "tabby",
    "kitten",
  ]);
  expect(ids(await library.listSpaceItems(cats.id))).toEqual([]);
  expect(
    ids(await library.listSpaceItems(cats.id, 100, null, new Map([["cat", axis("cat")]]))),
  ).toEqual([]);
  const page = await library.spaceCardsPage(cats.id, null, 100, null, prompts);
  expect(page).toMatchObject({ next: null, total: 2 });
  expect(ids(await library.listSpaceItems(cats.id, 1, null, prompts))).toEqual(["tabby"]);

  const pets = await library.createSpace({ name: "Cats and dogs" });
  expect(ids(await library.listSpaceItems(pets.id, 100, null, prompts)).sort()).toEqual([
    "kitten",
    "puppy",
    "tabby",
  ]);
  const tagged = await library.createSpace({ name: "Pets", query: { text: "cats", tag: "pets" } });
  expect(ids(await library.listSpaceItems(tagged.id, 100, null, prompts))).toEqual([
    "tabby",
    "kitten",
  ]);

  // Notes come in only when the Space asks for them by kind.
  const notes = await library.createSpace({
    name: "Cat notes",
    query: { text: "cat", kind: "note" },
  });
  expect(ids(await library.listSpaceItems(notes.id, 100, null, prompts))).toEqual(["cat-note"]);
  // Text that is more than a subject list stays an ordinary search.
  const training = await library.createSpace({ name: "My cat training" });
  expect(ids(await library.listSpaceItems(training.id, 100, null, prompts))).not.toContain("tabby");
});
