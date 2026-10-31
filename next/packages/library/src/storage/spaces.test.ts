import { afterAll, afterEach, expect, test } from "bun:test";
import { TEXT_MODEL } from "@inkling/contracts/jobs";
import { closeAll, ids, removeTemporaryRoots, temporaryLibrary, vector } from "./test-helpers.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("Smart Spaces apply saved filters to hybrid text-search candidates", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, 'note', ?, ?, ?, ?)`);
  insert.run("space-lexical", "quiet telescope", '{"tags":["misc"]}', 1, 30);
  insert.run("space-semantic", "night sky", '{"tags":["astronomy"]}', 2, 20);
  insert.run("space-wrong-tag", "distant galaxy", '{"tags":["misc"]}', 3, 10);
  await library.storeEmbedding("space-lexical", "text", TEXT_MODEL, vector([0, 1]), 2);
  await library.storeEmbedding("space-semantic", "text", TEXT_MODEL, vector([1, 0]), 2);
  await library.storeEmbedding("space-wrong-tag", "text", TEXT_MODEL, vector([0.99, 0.1]), 2);
  const space = await library.createSpace({
    name: "Astronomy",
    query: { text: "quiet telescope", tag: "astronomy" },
  });

  expect(ids(await library.listSpaceItems(space.id))).toEqual([]);
  expect(ids(await library.listSpaceItems(space.id, 100, Float32Array.from([1, 0])))).toEqual([
    "space-semantic",
  ]);
});

test("Smart Space predicates are applied before the result limit", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  insert.run("newer-tag-miss", "article", "Tokyo winter", '{"tags":["other"]}', 30, 30);
  insert.run("newer-kind-miss", "note", "Tokyo summer", '{"tags":["japan"]}', 20, 20);
  insert.run("older-match", "url", "Tokyo shrine", '{"tags":["Japan"]}', 10, 10);
  const space = await library.createSpace({
    name: "Tokyo reading",
    query: { text: "Tokyo", tag: "japan", kind: "article" },
  });

  expect(ids(await library.listSpaceItems(space.id, 1))).toEqual(["older-match"]);

  insert.run("unicode-tag", "note", "Cafe notes", '{"tags":["café"]}', 5, 5);
  const unicodeSpace = await library.createSpace({ name: "Cafe", query: { tag: "CAFÉ" } });
  expect(ids(await library.listSpaceItems(unicodeSpace.id))).toEqual(["unicode-tag"]);
});
