import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase, SCHEMA_VERSION } from "./schema.ts";

test("opening a newer library rejects before any schema, version or data mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-newer-schema-"));
  const path = join(root, "library.sqlite3");
  try {
    const future = new DatabaseSync(path);
    future.exec(
      `CREATE TABLE future_data(id TEXT PRIMARY KEY, value BLOB); INSERT INTO future_data VALUES('keep',x'010203'); PRAGMA user_version = ${SCHEMA_VERSION + 1};`,
    );
    const schema = future.prepare("SELECT name,sql FROM sqlite_schema ORDER BY name").all();
    future.close();
    expect(() => openDatabase(path)).toThrow("newer than supported");
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      expect(check.prepare("PRAGMA user_version").get()?.user_version).toBe(SCHEMA_VERSION + 1);
      expect(check.prepare("SELECT name,sql FROM sqlite_schema ORDER BY name").all()).toEqual(
        schema,
      );
      expect(check.prepare("SELECT hex(value) AS value FROM future_data").get()?.value).toBe(
        "010203",
      );
    } finally {
      check.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
