import { afterAll, afterEach, expect, test } from "bun:test";
import { IMAGE_MODEL, TEXT_MODEL } from "@inkling/contracts/jobs";
import { closeAll, ids, removeTemporaryRoots, temporaryLibrary, vector } from "./test-helpers.ts";
import { visualSubjectQuery, visualSubjects } from "@inkling/ingestion/photo-subjects";
import { interfaceLabel, labelImage, otherSubjects } from "./visual-subject.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

// One axis per label: a subject prompt points along its own axis, and an image is
// nearest the label it leans toward, as Nomic's real vectors do at a smaller scale.
const labels = [...visualSubjects, interfaceLabel, ...otherSubjects];
const axis = (label: string, weight = 1, ...also: [string, number][]) => {
  const values = new Array(labels.length).fill(0.01);
  values[labels.indexOf(label)] = weight;
  for (const [other, value] of also) values[labels.indexOf(other)] = value;
  return values;
};
const prompts = new Map(labels.map((label) => [label, axis(label)]));

test("an image is labelled by its nearest prompt of the same dimension", () => {
  expect(labelImage(axis("cat", 0.09), prompts)?.label).toBe("cat");
  expect(labelImage([1, 0], prompts)).toBeNull();
});

test("an unlisted subject is labelled as itself, never snapped to the nearest listed one", () => {
  // A lion photo that also looks a bit like a cat, and a cat that looks a bit like a lion.
  expect(labelImage(axis("lion", 0.09, ["cat", 0.08]), prompts)?.label).toBe("lion");
  expect(labelImage(axis("cat", 0.09, ["lion", 0.08]), prompts)?.label).toBe("cat");
  expect(otherSubjects.filter((word) => visualSubjectQuery(word))).toEqual([]);
  expect(new Set(otherSubjects).size).toBe(otherSubjects.length);
});

test("a Space named Cats holds cat photos by their pixels, or by their text until they can be judged", async () => {
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
  // Off-list: nearer a listed subject than to any other listed one, but nearest its own.
  insert.run("lion", "image", "neutral.png", "", '{"tags":["pets"]}', 1, 1, 0);
  await library.storeEmbedding(
    "lion",
    "image",
    IMAGE_MODEL,
    vector(axis("lion", 0.09, ["cat", 0.08])),
    labels.length,
  );
  insert.run("wolf", "image", "neutral.png", "", "{}", 1, 1, 0);
  await library.storeEmbedding(
    "wolf",
    "image",
    IMAGE_MODEL,
    vector(axis("bear", 0.07, ["dog", 0.06])),
    labels.length,
  );
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

  insert.run("unnamed-pending", "image", "IMG_0001.jpg", "", "{}", 1, 1, 0);
  // The user tagged it a cat, though its pixels lean toward a bear.
  insert.run("tagged-cat", "image", "IMG_0002.jpg", "", '{"tags":["Cat"]}', 1, 1, 0);
  await library.storeEmbedding(
    "tagged-cat",
    "image",
    IMAGE_MODEL,
    vector(axis("bear", 0.09)),
    labels.length,
  );

  const cats = await library.createSpace({ name: "Cats" });
  expect(cats.query).toEqual({});
  // Pixels decide for analyzed images, best match first; the user's tags and, for
  // images without a current vector, the words on them follow.
  const withPrompts = ids(await library.listSpaceItems(cats.id, 100, null, prompts));
  expect(withPrompts.slice(0, 2)).toEqual(["tabby", "kitten"]);
  expect(withPrompts.slice(2).sort()).toEqual(["old-model-cat", "pending-cat", "tagged-cat"]);
  const page = await library.spaceCardsPage(cats.id, null, 100, null, prompts);
  expect(page).toMatchObject({ next: null, total: 5 });
  expect(ids(await library.listSpaceItems(cats.id, 1, null, prompts))).toEqual(["tabby"]);
  // With no model, or a partial set of prompts, every image falls back to its text,
  // so the screenshot whose OCR says cat comes in and nothing is labelled.
  const byText = ["chat-shot", "old-model-cat", "pending-cat", "tagged-cat"];
  expect(ids(await library.listSpaceItems(cats.id)).sort()).toEqual(byText);
  const listedOnly = new Map([...prompts].filter(([label]) => !otherSubjects.includes(label)));
  expect(ids(await library.listSpaceItems(cats.id, 100, null, listedOnly)).sort()).toEqual(byText);

  const pets = await library.createSpace({ name: "Cats and dogs" });
  expect(ids(await library.listSpaceItems(pets.id, 100, null, prompts)).sort()).toEqual([
    "kitten",
    "old-model-cat",
    "pending-cat",
    "puppy",
    "tabby",
    "tagged-cat",
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
  // An unfiltered Space with any other name still lists every unarchived item.
  const everything = await library.createSpace({ name: "Everything" });
  expect(ids(await library.listSpaceItems(everything.id, 100, null, prompts)).sort()).toEqual([
    "cat-note",
    "chat-shot",
    "kitten",
    "lion",
    "old-model-cat",
    "pending-cat",
    "puppy",
    "tabby",
    "tagged-cat",
    "unnamed-pending",
    "wolf",
  ]);
  // Text that is more than a subject list stays an ordinary search.
  const training = await library.createSpace({
    name: "Training",
    query: { text: "cat training" },
  });
  expect(ids(await library.listSpaceItems(training.id, 100, null, prompts))).not.toContain("tabby");
});
