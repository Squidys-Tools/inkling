import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openTestLibrary, type TestLibrary } from "./storage/test-library.ts";
const roots: string[] = [],
  libraries: TestLibrary[] = [];
afterEach(async () => {
  for (const l of libraries.splice(0)) await l.close();
  Bun.gc(true);
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "inkling-exclusions-"));
  roots.push(root);
  const path = join(root, "library.sqlite3");
  const library = await openTestLibrary(path);
  libraries.push(library);
  return { root, path, library };
}
const ids = (items: ReadonlyArray<{ id: string }>) => items.map((i) => i.id);
test("Smart Space exclusion is local, idempotent and survives indexing writes and restart", async () => {
  const f = await setup(),
    l = f.library;
  const item = await l.createNote({ title: "Coding", body: "Coding field notes" });
  const a = await l.createSpace({ name: "Coding", query: { text: "coding" } }),
    b = await l.createSpace({ name: "Other coding", query: { text: "coding" } });
  expect(ids(await l.listSpaceItems(a.id))).toEqual([item.id]);
  await l.removeSpaceItem(a.id, item.id);
  await l.removeSpaceItem(a.id, item.id);
  await l.updateItem({
    id: item.id,
    body: "Coding field notes after background indexing",
    addTag: "indexed",
  });
  expect(await l.listSpaceItems(a.id)).toEqual([]);
  expect(ids(await l.listSpaceItems(b.id))).toEqual([item.id]);
  expect((await l.listActiveItems()).length).toBe(1);
  expect(await l.listItemSpaceExclusions(item.id)).toEqual([a.id]);
  libraries.splice(libraries.indexOf(l), 1);
  await l.close();
  const reopened = await openTestLibrary(f.path);
  libraries.push(reopened);
  expect(await reopened.listSpaceItems(a.id)).toEqual([]);
  expect(await reopened.listItemSpaceExclusions(item.id)).toEqual([a.id]);
  await reopened.addSpaceItem(a.id, item.id);
  expect(ids(await reopened.listSpaceItems(a.id))).toEqual([item.id]);
  await reopened.updateSpace({ id: a.id, query: { text: "penguins" } });
  await reopened.addSpaceItem(a.id, item.id);
  expect(await reopened.listSpaceItems(a.id)).toEqual([]);
});
test("Regular membership removal preserves Everything, other Spaces and active scoped counts", async () => {
  const { library: l } = await setup();
  const item = await l.createNote({ body: "kept globally" });
  const a = await l.createSpace({ name: "A", kind: "regular" }),
    b = await l.createSpace({ name: "B", kind: "regular" });
  await l.addSpaceItem(a.id, item.id);
  await l.addSpaceItem(b.id, item.id);
  await l.removeSpaceItem(a.id, item.id);
  expect(await l.listSpaceItems(a.id)).toEqual([]);
  expect(ids(await l.listSpaceItems(b.id))).toEqual([item.id]);
  expect((await l.listActiveItems()).length).toBe(1);
  expect((await l.listSpaces()).find((s) => s.id === a.id)?.itemCount).toBe(0);
  await l.archiveItem(item.id);
  expect((await l.listSpaces()).find((s) => s.id === b.id)?.itemCount).toBe(0);
  await l.archiveItem(item.id, false);
  expect((await l.listSpaces()).find((s) => s.id === b.id)?.itemCount).toBe(1);
});
test("schema8 libraries migrate without altering notes or manual memberships", async () => {
  const f = await setup(),
    l = f.library;
  const item = await l.createNote({ body: "legacy retained" }),
    space = await l.createSpace({ name: "Old", kind: "regular" });
  await l.addSpaceItem(space.id, item.id);
  libraries.splice(libraries.indexOf(l), 1);
  await l.close();
  const old = new DatabaseSync(f.path);
  old.exec("DROP TABLE space_exclusions; PRAGMA user_version=8");
  old.close();
  const upgraded = await openTestLibrary(f.path);
  libraries.push(upgraded);
  expect(upgraded.status().schemaVersion).toBe(10);
  expect(ids(await upgraded.listSpaceItems(space.id))).toEqual([item.id]);
  expect(await upgraded.listItemSpaceExclusions(item.id)).toEqual([]);
});
test("export/import preserves exclusions and does not overwrite an existing library choice", async () => {
  const f = await setup(),
    l = f.library;
  const item = await l.createNote({ body: "coding notes" }),
    space = await l.createSpace({ name: "Coding", query: { text: "coding" } });
  await l.removeSpaceItem(space.id, item.id);
  const dest = join(f.root, "exports");
  await mkdir(dest);
  const report = await l.exportLibrary(dest, 0);
  const restored = await openTestLibrary(join(f.root, "restored", "library.sqlite3"));
  libraries.push(restored);
  await restored.importLibrary(report.directory);
  expect(await restored.listSpaceItems(space.id)).toEqual([]);
  expect(await restored.listItemSpaceExclusions(item.id)).toEqual([space.id]);
  await restored.addSpaceItem(space.id, item.id);
  await restored.importLibrary(report.directory);
  expect(ids(await restored.listSpaceItems(space.id))).toEqual([item.id]);
  const source = new DatabaseSync(join(report.directory, "library.sqlite3"));
  source.exec("DROP TABLE space_exclusions; PRAGMA user_version=8");
  source.close();
  const manifestPath = join(report.directory, "manifest.json"),
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.schemaVersion = 8;
  await writeFile(manifestPath, JSON.stringify(manifest));
  const legacy = await openTestLibrary(join(f.root, "legacy-import", "library.sqlite3"));
  libraries.push(legacy);
  await legacy.importLibrary(report.directory);
  expect(ids(await legacy.listSpaceItems(space.id))).toEqual([item.id]);
});

test("permanent delete removes only its exclusions and keeps exports restorable", async () => {
  const f = await setup();
  const deleted = await f.library.createNote({ body: "coding deleted" });
  const kept = await f.library.createNote({ body: "coding kept" });
  const space = await f.library.createSpace({ name: "Coding", query: { text: "coding" } });
  await f.library.removeSpaceItem(space.id, deleted.id);
  await f.library.removeSpaceItem(space.id, kept.id);
  await f.library.archiveItem(deleted.id);
  await f.library.deleteItem(deleted.id);
  expect(await f.library.getItem(deleted.id)).toBeNull();
  expect(await f.library.listItemSpaceExclusions(deleted.id)).toEqual([]);
  expect(await f.library.listItemSpaceExclusions(kept.id)).toEqual([space.id]);
  const destination = join(f.root, "delete-exports");
  await mkdir(destination);
  const exported = await f.library.exportLibrary(destination, 0);
  const restored = await openTestLibrary(join(f.root, "delete-restored", "library.sqlite3"));
  libraries.push(restored);
  const report = await restored.importLibrary(exported.directory);
  expect(report.importedItems).toBe(1);
  expect(await restored.getItem(deleted.id)).toBeNull();
  expect(await restored.listItemSpaceExclusions(deleted.id)).toEqual([]);
  expect(await restored.listItemSpaceExclusions(kept.id)).toEqual([space.id]);
  expect(await restored.listSpaceItems(space.id)).toEqual([]);
});
