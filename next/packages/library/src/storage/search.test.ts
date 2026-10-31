import { afterAll, afterEach, expect, test } from "bun:test";
import { IMAGE_MODEL, TEXT_MODEL } from "../embedding-contract.ts";
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
