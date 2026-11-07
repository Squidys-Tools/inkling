import { afterAll, afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import {
  closeAll,
  closeDatabase,
  ids,
  removeTemporaryRoots,
  temporaryRoot,
  trackDatabase,
  trackedLibrary,
} from "./test-helpers.ts";
import { openDatabase, SCHEMA_VERSION } from "./schema.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("v7 libraries migrate note bodies, Space kind, jobs, and FTS to the current schema", async () => {
  const databasePath = join(temporaryRoot(), "v7.sqlite3");
  const db = trackDatabase(new DatabaseSync(databasePath));
  db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, title TEXT, description TEXT,
      source_url TEXT, source_label TEXT, local_asset_path TEXT, thumbnail_path TEXT,
      ocr_text TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE spaces (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'blue',
      query TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE jobs (id TEXT PRIMARY KEY NOT NULL, item_id TEXT NOT NULL, kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3, error_message TEXT, created_at INTEGER NOT NULL,
      started_at INTEGER, completed_at INTEGER);
    INSERT INTO items (id, kind, title, description, created_at, updated_at)
      VALUES ('legacy-note', 'note', 'Legacy', 'Old body', 1, 1);
    INSERT INTO spaces (id, name, created_at, updated_at)
      VALUES ('legacy-space', 'Old Space', 1, 1);
    PRAGMA user_version = 7;
  `);
  closeDatabase(db);

  const migrated = await trackedLibrary(databasePath);
  expect(migrated.status().schemaVersion).toBe(SCHEMA_VERSION);
  expect(await migrated.getItemContent("legacy-note")).toEqual({
    id: "legacy-note",
    body: "Old body",
    bodyFormat: "md",
  });
  expect((await migrated.getSpace("legacy-space"))?.kind).toBe("smart");
  expect(ids(await migrated.searchItems("Old"))).toEqual(["legacy-note"]);
  const pragma = (library: typeof migrated, name: string) =>
    library.run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return (yield* sql.unsafe(`PRAGMA ${name}`))[0];
      }),
    );
  expect(await pragma(migrated, "busy_timeout")).toEqual({ timeout: 5000 });
  // Tests skip disk syncs; a library that syncs keeps SQLite's FULL (2) on its connection.
  expect(await pragma(migrated, "synchronous")).toEqual({ synchronous: 0 });
  const syncing = await trackedLibrary(databasePath, { syncToDisk: true });
  expect(await pragma(syncing, "synchronous")).toEqual({ synchronous: 2 });
});

// A library saved by a newer app must survive an older app untouched, not be
// "migrated" down to a schema that drops what the newer one stored.
test("a library from a newer schema is refused without writing to it", async () => {
  const databasePath = join(temporaryRoot(), "newer.sqlite3");
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, future_column TEXT);
    INSERT INTO items VALUES ('kept', 'from the future');
    PRAGMA user_version = ${SCHEMA_VERSION + 1};`);
  db.close();
  const before = readFileSync(databasePath);

  expect(() => openDatabase(databasePath)).toThrow("saved by a newer version of inkling");
  await expect(trackedLibrary(databasePath)).rejects.toThrow("saved by a newer version of inkling");
  expect(readFileSync(databasePath).equals(before)).toBe(true);
  const after = trackDatabase(new DatabaseSync(databasePath, { readOnly: true }));
  expect(after.prepare("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION + 1 });
  expect(after.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([
    { name: "items" },
  ]);
});

// Both versions indexed raw metadata JSON, so each must rebuild its index on open.
test.each([9, 10])(
  "a v%i library rebuilds its search index on item rowids, without article markup, skipping the old trigger",
  async (version) => {
    const databasePath = join(temporaryRoot(), `v${version}.sqlite3`);
    const db = trackDatabase(new DatabaseSync(databasePath));
    db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, title TEXT, description TEXT,
      body TEXT NOT NULL DEFAULT '', body_format TEXT NOT NULL DEFAULT 'md', source_url TEXT,
      source_label TEXT, local_asset_path TEXT, thumbnail_path TEXT,
      ocr_text TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0
    );
    CREATE VIRTUAL TABLE items_fts USING fts5(
      item_id UNINDEXED, title, description, source_label, ocr_text, metadata, body
    );
    CREATE TABLE old_trigger_fired (id TEXT);
    CREATE TRIGGER items_fts_after_insert AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(item_id, title, metadata) VALUES (new.id, new.title, new.metadata);
    END;
    CREATE TRIGGER items_fts_after_update AFTER UPDATE ON items BEGIN
      DELETE FROM items_fts WHERE item_id = old.id;
      INSERT INTO items_fts(item_id, title, metadata) VALUES (new.id, new.title, new.metadata);
      INSERT INTO old_trigger_fired VALUES (new.id);
    END;
    INSERT INTO items (id, kind, title, metadata, created_at, updated_at) VALUES
      ('first', 'note', 'alpha', '{"html":"<p>markupword</p>","text":"plainword"}', 1, 1),
      ('second', 'note', 'bravo', '{}', 1, 1), ('third', 'note', 'charlie', '{}', 1, 1);
    -- The old trigger gives an updated item a new index rowid, so the two tables drift apart.
    UPDATE items SET title = 'bravo renamed' WHERE id = 'second';
    DELETE FROM old_trigger_fired;
    PRAGMA user_version = ${version};
  `);
    closeDatabase(db);

    const migrated = await trackedLibrary(databasePath);
    expect(migrated.db.prepare("SELECT COUNT(*) AS fired FROM old_trigger_fired").get()).toEqual({
      fired: 0,
    });
    expect(
      migrated.db
        .prepare(
          `SELECT i.id FROM items i JOIN items_fts f ON f.rowid = i.rowid AND f.item_id = i.id
         ORDER BY i.id`,
        )
        .all()
        .map((row) => row.id),
    ).toEqual(["first", "second", "third"]);
    expect(ids(await migrated.searchItems("renamed"))).toEqual(["second"]);
    expect(ids(await migrated.searchItems("plainword"))).toEqual(["first"]);
    expect(ids(await migrated.searchItems("markupword"))).toEqual([]);
  },
);

test("the search index follows indexed columns only and each write touches only its own row", async () => {
  const library = await trackedLibrary(join(temporaryRoot(), "library.sqlite3"));
  const note = await library.createNote({ title: "Original", body: "keepsake" });
  const other = await library.createNote({ title: "Neighbor", body: "bystander" });
  if (!note || !other) throw new Error("notes were not saved");
  const write = (assignment: string) => {
    const totalChanges = () =>
      Number(library.db.prepare("SELECT total_changes() AS total").get()?.total);
    const before = totalChanges();
    library.db.prepare(`UPDATE items SET ${assignment} WHERE id = ?`).run(note.id);
    return totalChanges() - before;
  };
  expect(library.db.prepare("SELECT rowid FROM items_fts WHERE item_id = ?").get(note.id)).toEqual(
    library.db.prepare("SELECT rowid FROM items WHERE id = ?").get(note.id),
  );

  // total_changes counts trigger writes, so 1 means the item changed and its index row did not.
  for (const assignment of [
    "archived = 1",
    "archived = 0",
    "favorite = 1",
    "thumbnail_path = 'assets/items/x/thumbnail.webp'",
    "updated_at = 99",
    "title = title, description = description, metadata = metadata, body = body",
  ]) {
    expect(write(assignment)).toBe(1);
  }

  for (const [column, value, word] of [
    ["title", "'titleword'", "titleword"],
    ["description", "'descriptionword'", "descriptionword"],
    ["source_label", "'labelword'", "labelword"],
    ["ocr_text", "'ocrword'", "ocrword"],
    ["metadata", `'{"text":"metadataword"}'`, "metadataword"],
    ["body", "'bodyword'", "bodyword"],
  ]) {
    write(`${column} = ${value}`);
    expect(ids(await library.searchItems(word))).toEqual([note.id]);
  }
  expect(ids(await library.searchItems("keepsake"))).toEqual([]);
  expect(ids(await library.searchItems("bystander"))).toEqual([other.id]);

  // SQLite reuses the highest rowid after a delete, so the new row must not inherit the old index.
  library.db.prepare("DELETE FROM items WHERE id = ?").run(other.id);
  expect(ids(await library.searchItems("bystander"))).toEqual([]);
  const next = await library.createNote({ title: "Newcomer", body: "arrival" });
  if (!next) throw new Error("note was not saved");
  expect(ids(await library.searchItems("arrival"))).toEqual([next.id]);
  expect(ids(await library.searchItems("bodyword"))).toEqual([note.id]);
});
