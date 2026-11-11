import { afterAll, afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { IMAGE_MODEL } from "@inkling/contracts/jobs";
import parity from "../fixtures/storage-parity.json";
import {
  closeAll,
  closeLibrary,
  ids,
  removeTemporaryRoots,
  temporaryLibrary,
  trackedLibrary,
  vector,
} from "./test-helpers.ts";
import { seedFromDemo } from "./test-seed.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("completed onboarding persists across library reopen", async () => {
  const { root, library } = await temporaryLibrary();
  expect(await library.hasCompletedOnboarding()).toBe(false);
  await library.completeOnboarding();
  await closeLibrary(library);
  const reopened = await trackedLibrary(join(root, "library.sqlite3"));
  expect(await reopened.hasCompletedOnboarding()).toBe(true);
});

test("demo-seed search, Smart Space, Regular Space, CRUD, and semantic ranking match goldens", async () => {
  const { root, library } = await temporaryLibrary();
  seedFromDemo(library);

  expect(library.status().fts5Enabled).toBe(true);
  expect(ids(await library.listActiveItems())).toEqual(parity.activeOrder);
  expect(ids(await library.searchItems("lanterns"))).toEqual(parity.queries.lanterns);
  expect(ids(await library.searchItems("japan"))).toEqual(parity.queries.japan);
  expect(await library.searchItems("japan", 0)).toHaveLength(1);
  const withoutFts = await trackedLibrary(join(root, "library.sqlite3"), { useFts5: false });
  expect(ids(await withoutFts.searchItems("japan"))).toEqual(parity.queries.japan);

  const smart = await library.createSpace({ name: "Japan", query: { tag: "japan" } });
  const regular = await library.createSpace({
    name: "Weekend",
    kind: "regular",
    query: { text: "ignored" },
  });
  if (!smart || !regular) throw new Error("Spaces were not created");
  expect(ids(await library.listSpaceItems(smart.id))).toEqual(parity.smartSpace);
  await library.addSpaceItem(regular.id, "me-fuji-night");
  await library.addSpaceItem(regular.id, "me-lanterns");
  await library.updateSpace({ id: regular.id, color: "yellow" });
  const spaces = await library.listSpaces();
  expect(spaces).toMatchObject([
    { id: smart.id, kind: "smart" },
    { id: regular.id, kind: "regular", color: "yellow", itemCount: 2 },
  ]);
  expect(spaces[0]).not.toHaveProperty("itemCount");
  expect(await library.listSpaceItems(regular.id, 0)).toHaveLength(1);
  library.db
    .prepare(
      "UPDATE space_items SET added_at = CASE item_id WHEN 'me-fuji-night' THEN 1 ELSE 2 END WHERE space_id = ?",
    )
    .run(regular.id);
  expect(ids(await library.listSpaceItems(regular.id))).toEqual(parity.regularSpace);
  expect(await library.listItemSpaces("me-fuji-night")).toEqual([regular.id]);

  const insertEmbedding = library.db.prepare(`INSERT INTO item_embeddings
    (item_id, kind, model, dimension, vector, created_at) VALUES (?, 'image', ?, 2, ?, 1)`);
  insertEmbedding.run("me-fuji-night", IMAGE_MODEL, vector([1, 0]));
  insertEmbedding.run("me-lanterns", IMAGE_MODEL, vector([0.8, 0.2]));
  expect(ids(await library.searchSimilar("me-fuji-night", "image"))).toEqual(["me-lanterns"]);
  expect(await library.searchSimilar("me-fuji-night", "image", 0)).toHaveLength(1);

  const note = await library.createNote({
    title: "Field notes",
    body: "## Evening\n\nWarm light.",
  });
  expect(note.description).toBe("Evening Warm light.");
  expect(await library.getItemContent(note.id)).toEqual({
    id: note.id,
    body: "## Evening\n\nWarm light.",
    bodyFormat: "md",
  });
  const updated = await library.updateItem({ id: note.id, addTag: "#Reading" });
  expect(updated?.metadata.tags).toEqual(["reading"]);
  expect(ids(await library.searchItems("reading"))).toEqual([note.id]);
  const untagged = await library.updateItem({ id: note.id, addTag: "fall", removeTag: "#READING" });
  expect(untagged?.metadata.tags).toEqual(["fall"]);
  expect(ids(await library.searchItems("reading"))).toEqual([]);
  await library.archiveItem(note.id);
  expect(ids(await library.listArchivedItems())).toContain(note.id);
  await library.archiveItem(note.id, false);
  expect(ids(await library.listActiveItems())).toContain(note.id);
});
