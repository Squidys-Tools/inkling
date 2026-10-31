import { afterAll, afterEach, expect, test } from "bun:test";
import { IMAGE_MODEL, TEXT_MODEL } from "@inkling/contracts/jobs";
import { closeAll, ids, removeTemporaryRoots, temporaryLibrary, vector } from "./test-helpers.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("free-text search hybrid-ranks lexical and Nomic semantic matches", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`);
  insert.run("lexical-match", "note", "violet galaxy", 1, 30);
  insert.run("semantic-text", "note", "night sky", 2, 20);
  insert.run("semantic-image", "image", "distant sun", 3, 10);
  insert.run("negative-match", "note", "antipodal", 4, 5);
  insert.run("legacy-image", "image", "old image vector", 5, 4);
  insert.run("archived-match", "note", "archived stars", 6, 3);

  await library.storeEmbedding("lexical-match", "text", TEXT_MODEL, vector([0, 1]), 2);
  await library.storeEmbedding("semantic-text", "text", TEXT_MODEL, vector([0.8, 0.6]), 2);
  await library.storeEmbedding(
    "semantic-image",
    "image",
    IMAGE_MODEL,
    vector([0.9, Math.sqrt(0.19)]),
    2,
  );
  // Its OCR text vector must not lift it above lexical matches as if it matched both.
  await library.storeEmbedding("semantic-image", "text", TEXT_MODEL, vector([0.6, 0.8]), 2);
  await library.storeEmbedding("negative-match", "text", TEXT_MODEL, vector([-1, 0]), 2);
  await library.storeEmbedding(
    "legacy-image",
    "image",
    "nomic-embed-vision-v1.5",
    vector([1, 0]),
    2,
  );
  await library.storeEmbedding("archived-match", "text", TEXT_MODEL, vector([1, 0]), 2);
  await library.archiveItem("archived-match");

  const queryVector = Float32Array.from([1, 0]);
  expect(ids(await library.searchItems("violet galaxy", 20, queryVector))).toEqual([
    "lexical-match",
    "semantic-image",
    "semantic-text",
  ]);
  expect(ids(await library.searchItems("quiet telescope", 20, queryVector))).toEqual([
    "semantic-image",
    "semantic-text",
  ]);
});

test("free-text search keeps lexical matches and drops weak semantic matches", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`);
  insert.run("lexical-weak", "note", "zeppelin", 1, 10);
  insert.run("strong-semantic", "note", "airship history", 2, 20);
  insert.run("weak-semantic", "note", "bicycle repair", 3, 30);

  await library.storeEmbedding(
    "lexical-weak",
    "text",
    TEXT_MODEL,
    vector([0.2, Math.sqrt(0.96)]),
    2,
  );
  await library.storeEmbedding(
    "strong-semantic",
    "text",
    TEXT_MODEL,
    vector([0.9, Math.sqrt(0.19)]),
    2,
  );
  await library.storeEmbedding(
    "weak-semantic",
    "text",
    TEXT_MODEL,
    vector([0.5, Math.sqrt(0.75)]),
    2,
  );

  const queryVector = Float32Array.from([1, 0]);
  expect(ids(await library.searchItems("zeppelin", 20, queryVector))).toEqual([
    "lexical-weak",
    "strong-semantic",
  ]);
  expect(ids(await library.searchItems("qwxzv bnmk", 20, queryVector))).toEqual([
    "strong-semantic",
  ]);
  expect(ids(await library.searchItems("quiet telescope", 20, queryVector))).toEqual([
    "strong-semantic",
  ]);
});

test("LIKE fallback treats percent and underscore as literal search characters", async () => {
  const { library } = await temporaryLibrary({ useFts5: false });
  const insert = library.db.prepare(`INSERT INTO items (id, kind, title, created_at, updated_at)
    VALUES (?, 'note', ?, ?, ?)`);
  insert.run("literal-percent", "100% organic", 1, 1);
  insert.run("wildcard-percent", "100 products", 2, 2);
  insert.run("literal-underscore", "file_name", 3, 3);
  insert.run("wildcard-underscore", "fileXname", 4, 4);

  expect(ids(await library.searchItems("100%"))).toEqual(["literal-percent"]);
  expect(ids(await library.searchItems("file_name"))).toEqual(["literal-underscore"]);
});

test("semantic search follows re-embedded, deleted and archived items after vectors are cached", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`);
  for (const [index, id] of ["moved", "deleted", "archived", "kept"].entries()) {
    insert.run(id, "note", `${id} note`, index, index);
  }
  await library.storeEmbedding("moved", "text", TEXT_MODEL, vector([1, 0]), 2);
  await library.storeEmbedding("deleted", "text", TEXT_MODEL, vector([0.9, Math.sqrt(0.19)]), 2);
  await library.storeEmbedding("archived", "text", TEXT_MODEL, vector([0.8, 0.6]), 2);
  await library.storeEmbedding("kept", "text", TEXT_MODEL, vector([0.6, 0.8]), 2);
  const east = Float32Array.from([1, 0]);
  expect(ids(await library.searchItems("unrelated", 20, east))).toEqual([
    "moved",
    "deleted",
    "archived",
    "kept",
  ]);

  await library.storeEmbedding("moved", "text", TEXT_MODEL, vector([0, 1]), 2);
  expect(ids(await library.searchItems("unrelated", 20, east))).toEqual([
    "deleted",
    "archived",
    "kept",
  ]);
  library.db.exec("DELETE FROM items WHERE id = 'deleted'");
  await library.archiveItem("archived");
  expect(ids(await library.searchItems("unrelated", 20, east))).toEqual(["kept"]);
  expect(ids(await library.searchSimilar("kept", "text", 12))).toEqual(["moved"]);

  await library.archiveItem("archived", false);
  expect(ids(await library.searchItems("unrelated", 20, east))).toEqual(["archived", "kept"]);
});

// One transaction for all rows: a commit per row through storeEmbedding times these tests out.
function seedNotes(
  library: Awaited<ReturnType<typeof temporaryLibrary>>["library"],
  notes: { id: string; at: number; embedding: number[]; archived?: boolean }[],
) {
  const item = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, archived, created_at, updated_at) VALUES (?, 'note', ?, '{}', ?, ?, ?)`);
  const embedding = library.db.prepare(`INSERT INTO item_embeddings
    (item_id, kind, model, dimension, vector, created_at) VALUES (?, 'text', ?, ?, ?, 0)`);
  library.db.exec("BEGIN");
  for (const note of notes) {
    item.run(note.id, note.id, note.archived ? 1 : 0, note.at, note.at);
    embedding.run(note.id, TEXT_MODEL, note.embedding.length, vector(note.embedding));
  }
  library.db.exec("COMMIT");
}

test("archived items that outscore every visible match do not hide it", async () => {
  const { library } = await temporaryLibrary();
  seedNotes(library, [
    ...Array.from({ length: 80 }, (_, index) => ({
      id: `archived-${index}`,
      at: index,
      embedding: [0.9, 0],
      archived: true,
    })),
    { id: "probe", at: 100, embedding: [1, 0] },
    { id: "visible", at: 101, embedding: [0.6, 0.8] },
  ]);
  expect(ids(await library.searchItems("unrelated", 20, Float32Array.from([1, 0])))).toEqual([
    "probe",
    "visible",
  ]);
  expect(ids(await library.searchSimilar("probe", "text", 12))).toEqual(["visible"]);
});

test("exact-score ties across the result cap keep the newest items first", async () => {
  const { library } = await temporaryLibrary();
  seedNotes(
    library,
    Array.from({ length: 60 }, (_, index) => ({
      id: `dup-${String(index).padStart(2, "0")}`,
      at: index,
      embedding: [1, 0],
    })),
  );
  expect(ids(await library.searchItems("unrelated", 20, Float32Array.from([1, 0])))).toEqual(
    Array.from({ length: 20 }, (_, index) => `dup-${59 - index}`),
  );
  expect(await library.searchSimilar("dup-00", "text", 12)).toHaveLength(12);
});
