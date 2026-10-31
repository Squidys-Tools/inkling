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

test("v7 libraries migrate note bodies, Space kind, jobs, and FTS to schema 8", async () => {
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
  expect(migrated.status().schemaVersion).toBe(8);
  expect(await migrated.getItemContent("legacy-note")).toEqual({
    id: "legacy-note",
    body: "Old body",
    bodyFormat: "md",
  });
  expect((await migrated.getSpace("legacy-space"))?.kind).toBe("smart");
  expect(ids(await migrated.searchItems("Old"))).toEqual(["legacy-note"]);
  const [busy] = await migrated.run(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return yield* sql`PRAGMA busy_timeout`;
    }),
  );
  expect(busy).toEqual({ timeout: 5000 });
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
