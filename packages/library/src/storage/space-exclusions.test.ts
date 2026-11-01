import { afterAll, afterEach, expect, test } from "bun:test";
import { closeAll, ids, removeTemporaryRoots, temporaryLibrary } from "./test-helpers.ts";
afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("excluded hits do not consume a hybrid Space's top-200 candidate slots", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(
    "INSERT INTO items (id,kind,title,created_at,updated_at) VALUES (?, 'note', 'quiet', ?, ?)",
  );
  for (let index = 0; index < 201; index++) insert.run(`note-${index}`, index, index);
  const space = await library.createSpace({ name: "Quiet", query: { text: "quiet" } });
  const vector = Float32Array.from([1, 0]);
  const original = await library.spaceCardsPage(space.id, null, 200, vector);
  expect(original.cards).toHaveLength(200);
  await library.removeSpaceItem(space.id, original.cards[0].id);
  const refilled = await library.spaceCardsPage(space.id, null, 200, vector);
  expect(refilled.cards).toHaveLength(200);
  expect(ids(refilled.cards)).toContain("note-0");
  for (const card of original.cards.slice(1)) await library.removeSpaceItem(space.id, card.id);
  expect(await library.spaceCardsPage(space.id, null, 200, vector)).toMatchObject({ total: 1 });
  expect(ids(await library.listSpaceItems(space.id, 200, vector))).toEqual(["note-0"]);
  expect(await library.searchItems("quiet", 200, vector)).toHaveLength(200);
});

test("smart removals stay local, survive query changes and can be allowed again", async () => {
  const { library } = await temporaryLibrary();
  const note = await library.createNote({ title: "quiet cat", body: "quiet cat" });
  const first = await library.createSpace({ name: "Quiet", query: { text: "quiet" } });
  const other = await library.createSpace({ name: "Other", query: { text: "quiet cat" } });
  expect(ids(await library.listSpaceItems(first.id))).toEqual([note.id]);
  await library.removeSpaceItem(first.id, note.id);
  expect(await library.listSpaceItems(first.id)).toEqual([]);
  expect(ids(await library.listSpaceItems(other.id))).toEqual([note.id]);
  expect(ids(await library.listActiveItems())).toEqual([note.id]);
  await library.updateSpace({ id: first.id, query: { text: "quiet cat" } });
  expect(await library.listSpaceItems(first.id)).toEqual([]);
  expect(await library.listSpaceExclusions(note.id)).toEqual([first.id]);
  await library.addSpaceItem(first.id, note.id);
  expect(ids(await library.listSpaceItems(first.id))).toEqual([note.id]);
  await library.removeSpaceItem(first.id, note.id);
  await library.deleteSpace(first.id);
  expect(await library.listSpaceExclusions(note.id)).toEqual([]);
});

test("photo subject matches honor local removal and regular Spaces never archive", async () => {
  const { library } = await temporaryLibrary();
  const regular = await library.createSpace({ name: "Filed", kind: "regular" });
  expect((await library.listSpaces()).find((s) => s.id === regular.id)?.itemCount).toBe(0);
  const note = await library.createNote({ body: "keep" });
  await library.addSpaceItem(regular.id, note.id);
  await library.removeSpaceItem(regular.id, note.id);
  expect(await library.listSpaceItems(regular.id)).toEqual([]);
  expect((await library.getItem(note.id))?.archived).toBe(false);
  library.db
    .prepare(
      "INSERT INTO items (id,kind,title,created_at,updated_at) VALUES ('cat','image','cat.png',1,1)",
    )
    .run();
  const cats = await library.createSpace({ name: "Cats" });
  expect(ids(await library.listSpaceItems(cats.id))).toEqual(["cat"]);
  await library.removeSpaceItem(cats.id, "cat");
  expect(await library.listSpaceItems(cats.id)).toEqual([]);
});
