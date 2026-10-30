import { afterAll, afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  closeAll,
  closeDatabase,
  ids,
  removeTemporaryRoots,
  seedFromDemo,
  temporaryLibrary,
  trackDatabase,
  trackedLibrary,
} from "./test-helpers.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("export snapshots and hashes assets; restore rejects tampering and imports the verified copy", async () => {
  const { root, library } = await temporaryLibrary();
  seedFromDemo(library);
  const assetDirectory = join(root, "assets", "items", "me-fuji-night");
  mkdirSync(assetDirectory, { recursive: true });
  writeFileSync(join(assetDirectory, "reference.txt"), "local asset");
  library.db
    .prepare("UPDATE items SET local_asset_path = ?, metadata = ? WHERE id = ?")
    .run(
      "assets/items/me-fuji-night/reference.txt",
      JSON.stringify({ tags: ["japan"], byteLength: 11 }),
      "me-fuji-night",
    );
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  expect(report).toMatchObject({ items: 4, assetFiles: 1, skippedAssets: 0 });
  const manifest = JSON.parse(readFileSync(join(report.directory, "manifest.json"), "utf8"));
  expect(manifest.assetFiles[0]).toMatchObject({
    path: "assets/items/me-fuji-night/reference.txt",
    byteLength: 11,
  });

  const restored = await trackedLibrary(join(root, "restored", "library.sqlite3"));
  const exportedAsset = join(report.directory, "assets", "items", "me-fuji-night", "reference.txt");
  writeFileSync(exportedAsset, "tampered");
  await expect(restored.importLibrary(report.directory)).rejects.toThrow("damaged asset");
  expect(await restored.listActiveItems()).toEqual([]);

  writeFileSync(exportedAsset, "local asset");
  const imported = await restored.importLibrary(report.directory);
  expect(imported).toMatchObject({
    importedItems: 4,
    importedSpaces: 0,
    assetFiles: 1,
    unverifiedAssetFiles: 0,
  });
  expect(
    readFileSync(
      join(root, "restored", "assets", "items", "me-fuji-night", "reference.txt"),
      "utf8",
    ),
  ).toBe("local asset");
  expect((await restored.getItem("me-fuji-night"))?.localAssetPath).toBe(
    "assets/items/me-fuji-night/reference.txt",
  );
});

test("restore rejects item ids that could escape the managed asset directory", async () => {
  const { root, library } = await temporaryLibrary();
  await library.createNote({ title: "Safe note", body: "No assets." });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  const exportedDatabase = trackDatabase(
    new DatabaseSync(join(report.directory, "library.sqlite3")),
  );
  exportedDatabase.exec("DELETE FROM jobs");
  exportedDatabase.prepare("UPDATE items SET id = ?").run("../../outside");
  closeDatabase(exportedDatabase);

  const restored = await trackedLibrary(join(root, "restored", "library.sqlite3"));
  await expect(restored.importLibrary(report.directory)).rejects.toThrow("unsafe item id");
  expect(await restored.listActiveItems()).toEqual([]);
});

test("restore keeps an item whose stored source URL is not a web link and drops the link", async () => {
  const { root, library } = await temporaryLibrary();
  const note = await library.createNote({ title: "Kept note", body: "Survives import." });
  library.db
    .prepare("UPDATE items SET source_url = ? WHERE id = ?")
    .run("javascript:alert(1)", note.id);
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);

  const restored = await trackedLibrary(join(root, "restored", "library.sqlite3"));
  await restored.importLibrary(report.directory);

  const item = await restored.getItem(note.id);
  expect(item).not.toBeNull();
  expect(item?.sourceUrl).toBeNull();
});

test("restore preserves Space kinds, ordering, and Regular Space membership", async () => {
  const { root, library } = await temporaryLibrary();
  const item = await library.createNote({
    title: "Japan reading list",
    body: "Find quiet places to stay.",
    metadata: { tags: ["japan"] },
  });
  const regular = await library.createSpace({
    name: "Read later",
    kind: "regular",
    color: "yellow",
  });
  if (!item || !regular) throw new Error("fixtures were not created");
  await library.addSpaceItem(regular.id, item.id);
  await library.createSpace({ name: "Japan", query: { tag: "japan" } });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);

  const restored = await trackedLibrary(join(root, "restored", "library.sqlite3"));
  await restored.importLibrary(report.directory);

  const spaces = await restored.listSpaces();
  expect(spaces.map((space) => [space.name, space.kind])).toEqual([
    ["Read later", "regular"],
    ["Japan", "smart"],
  ]);
  expect(spaces[0].color).toBe("yellow");
  expect(spaces[0].itemCount).toBe(1);
  expect(ids(await restored.listSpaceItems(regular.id))).toEqual([item.id]);
  expect(ids(await restored.listSpaceItems(spaces[1].id))).toEqual([item.id]);
});

test("restore rejects unsupported Smart Space query fields", async () => {
  const { root, library } = await temporaryLibrary();
  await library.createSpace({ name: "Japan", query: { tag: "japan" } });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  const exportedDatabase = trackDatabase(
    new DatabaseSync(join(report.directory, "library.sqlite3")),
  );
  exportedDatabase.prepare("UPDATE spaces SET query = ?").run('{"future":"ignored"}');
  closeDatabase(exportedDatabase);

  const restored = await trackedLibrary(join(root, "restored", "library.sqlite3"));
  await expect(restored.importLibrary(report.directory)).rejects.toThrow(
    "unsupported Space query field",
  );
  expect(await restored.listSpaces()).toEqual([]);
});

test("restore keeps stored pins and accepts an older pin filter", async () => {
  const { root, library } = await temporaryLibrary();
  const item = await library.createNote({ title: "Pinned before pins went away", body: "Kept." });
  library.db.prepare("UPDATE items SET favorite = 1 WHERE id = ?").run(item.id);
  await library.createSpace({ name: "Pinned", query: { tag: "japan" } });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  const exportedDatabase = trackDatabase(
    new DatabaseSync(join(report.directory, "library.sqlite3")),
  );
  exportedDatabase.prepare("UPDATE spaces SET query = ?").run('{"favorite":true}');
  closeDatabase(exportedDatabase);

  const restored = await trackedLibrary(join(root, "restored", "library.sqlite3"));
  await restored.importLibrary(report.directory);

  expect((await restored.listSpaces()).map((space) => [space.name, space.query])).toEqual([
    ["Pinned", {}],
  ]);
  expect(restored.db.prepare("SELECT favorite FROM items WHERE id = ?").get(item.id)).toEqual({
    favorite: 1,
  });
});

test("restore removes staged assets when the active library rejects its transaction", async () => {
  const { root, library } = await temporaryLibrary();
  const item = await library.saveFile({
    fileName: "reference.txt",
    mimeType: "text/plain",
    kind: "other",
    bytes: new TextEncoder().encode("verified local file"),
  });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);

  const restored = await trackedLibrary(join(root, "restored", "library.sqlite3"));
  restored.db.exec(`CREATE TRIGGER reject_import BEFORE INSERT ON items BEGIN
    SELECT RAISE(ABORT, 'test import failure');
  END;`);
  await expect(restored.importLibrary(report.directory)).rejects.toThrow("test import failure");

  expect(await restored.listActiveItems()).toEqual([]);
  expect(existsSync(join(root, "restored", "assets", "items", item.id))).toBe(false);
});
