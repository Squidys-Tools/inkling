import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  closeAll,
  closeDatabase,
  closeLibrary,
  removeTemporaryRoots,
  temporaryLibrary,
  trackDatabase,
  trackedLibrary,
} from "./test-helpers.ts";
import type { TestLibrary } from "./test-library.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("export counts and copies assets from the database snapshot", async () => {
  let library: TestLibrary | undefined;
  const opened = await temporaryLibrary({
    media: {
      createSnapshot: async (_source, snapshotPath) => {
        library?.db.prepare("VACUUM INTO ?").run(snapshotPath);
        await library?.createNote({ title: "After snapshot", body: "Not present in the backup." });
      },
    },
  });
  library = opened.library;
  await library.createNote({ title: "Before snapshot", body: "Present in the backup." });
  const destination = join(opened.root, "exports");
  mkdirSync(destination);

  const report = await library.exportLibrary(destination, 0);
  const snapshot = trackDatabase(
    new DatabaseSync(join(report.directory, "library.sqlite3"), { readOnly: true }),
  );
  const snapshotCount = snapshot.prepare("SELECT COUNT(*) AS count FROM items").get()?.count;
  closeDatabase(snapshot);

  expect(await library.listActiveItems()).toHaveLength(2);
  expect(report.items).toBe(1);
  expect(snapshotCount).toBe(1);
  expect(
    JSON.parse(readFileSync(join(report.directory, "manifest.json"), "utf8")).counts.items,
  ).toBe(1);
});

test("export identifies regenerable search data without discarding tag suppression choices", async () => {
  const { root, library } = await temporaryLibrary();
  const item = await library.createNote({ body: "Keep my explicit choices" });
  library.db
    .prepare(
      "INSERT INTO search_ai(item_id,model,asset_path,caption,tags,removed_tags) VALUES(?,?,?,?,?,?)",
    )
    .run(item.id, "fixture", "fixture", "derived description", '["cat"]', '["cat"]');
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  const manifest = JSON.parse(readFileSync(join(report.directory, "manifest.json"), "utf8"));
  for (const table of [
    "search_chunks",
    "search_chunks_fts",
    "search_vectors",
    "search_index_state",
    "search_pages",
  ])
    expect(manifest.regenerable.tables).toContain(table);
  expect(manifest.regenerable.columns).toContain("items.search_revision");
  expect(manifest.regenerable.tables).not.toContain("search_ai");
  expect(manifest.regenerable.columns).not.toContain("search_ai.removed_tags");
  expect(manifest.durableSearchChoices.columns).toContain("search_ai.removed_tags");
  const snapshot = trackDatabase(
    new DatabaseSync(join(report.directory, "library.sqlite3"), { readOnly: true }),
  );
  expect(
    snapshot.prepare("SELECT removed_tags FROM search_ai WHERE item_id=?").get(item.id)
      ?.removed_tags,
  ).toBe('["cat"]');
});

test("successful export details persist across reopening the library", async () => {
  const { root, library } = await temporaryLibrary();
  await library.createNote({ title: "Exported note", body: "A small library copy." });
  const destination = join(root, "exports");
  mkdirSync(destination);
  expect(await library.getLastExport()).toBeNull();

  const report = await library.exportLibrary(destination, 0);
  const lastExport = await library.getLastExport();
  expect(lastExport).toMatchObject({ exportedAt: expect.any(Number), items: report.items });
  await closeLibrary(library);

  const reopened = await trackedLibrary(join(root, "library.sqlite3"));
  expect(await reopened.getLastExport()).toEqual(lastExport);
});
