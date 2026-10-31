import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { snapshotDatabase } from "./sqlite-snapshot.ts";

const root = mkdtempSync(join(tmpdir(), "inkling-snapshot-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("the snapshot worker copies a consistent database beside the module that starts it", async () => {
  const source = join(root, "library.sqlite3");
  const db = new DatabaseSync(source);
  db.exec("CREATE TABLE items (id TEXT); INSERT INTO items VALUES ('kept')");
  db.close();

  await snapshotDatabase(source, join(root, "snapshot.sqlite3"));
  const snapshot = new DatabaseSync(join(root, "snapshot.sqlite3"));
  expect(snapshot.prepare("SELECT id FROM items").all()).toEqual([{ id: "kept" }]);
  snapshot.close();

  await expect(snapshotDatabase(source, join(root, "snapshot.sqlite3"))).rejects.toThrow();
});
