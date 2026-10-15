import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { personalSeedItems } from "../src/seedPersonal";
import {
  JobQueue,
  JobWorker,
  JOB_LEASE_MILLIS,
  openLibraryStorage,
  resolveLibraryDataDirectory,
} from "./storage.mjs";
import parity from "./fixtures/storage-parity.json";

const roots: string[] = [];
const databases = new Set<DatabaseSync>();

function trackDatabase(database: DatabaseSync) {
  databases.add(database);
  return database;
}

function closeDatabase(database: DatabaseSync) {
  databases.delete(database);
  database.close();
}

function trackedLibrary(path: string, options = {}) {
  const library = openLibraryStorage(path, options);
  databases.add(library.db);
  return library;
}

function temporaryLibrary(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "inkling-electron-storage-"));
  roots.push(root);
  return { root, library: trackedLibrary(join(root, "library.sqlite3"), options) };
}

function seedFromDemo(library: ReturnType<typeof openLibraryStorage>) {
  const selected = personalSeedItems.filter((item) => parity.sourceIds.includes(item.id));
  const insert =
    library.db.prepare(`INSERT INTO items (id, kind, title, description, body, body_format,
    source_label, metadata, ocr_text, created_at, updated_at, favorite)
    VALUES (?, ?, ?, ?, '', 'md', 'Downloads', ?, '', ?, ?, ?)`);
  selected.forEach((item, index) => {
    const id = item.id;
    const now = index + 1;
    insert.run(
      id,
      item.kind.toLowerCase(),
      item.title,
      item.description,
      JSON.stringify({ tags: item.tags }),
      now,
      now,
      Number(item.favorite ?? false),
    );
  });
  return selected;
}

function vector(values: number[]) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => {
    bytes.writeFloatLE(value, index * 4);
  });
  return bytes;
}

afterEach(() => {
  for (const database of databases) database.close();
  databases.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("demo-seed search, Smart Space, Regular Space, CRUD, and semantic ranking match goldens", () => {
  const { library } = temporaryLibrary();
  seedFromDemo(library);

  expect(library.fts5Enabled).toBe(true);
  expect(library.listActiveItems().map((item) => item.id)).toEqual(parity.activeOrder);
  expect(library.searchItems("lanterns").map((item) => item.id)).toEqual(parity.queries.lanterns);
  expect(library.searchItems("japan").map((item) => item.id)).toEqual(parity.queries.japan);
  expect(library.searchItems("japan", 0)).toHaveLength(1);
  library.fts5Enabled = false;
  expect(library.searchItems("japan").map((item) => item.id)).toEqual(parity.queries.japan);
  library.fts5Enabled = true;

  const smart = library.createSpace({ name: "Japan", query: { tag: "japan" } });
  const regular = library.createSpace({
    name: "Weekend",
    kind: "regular",
    query: { text: "ignored" },
  });
  expect(library.listSpaceItems(smart.id).map((item) => item.id)).toEqual(parity.smartSpace);
  library.addSpaceItem(regular.id, "me-fuji-night");
  library.addSpaceItem(regular.id, "me-lanterns");
  expect(library.listSpaceItems(regular.id, 0)).toHaveLength(1);
  library.db
    .prepare(
      "UPDATE space_items SET added_at = CASE item_id WHEN 'me-fuji-night' THEN 1 ELSE 2 END WHERE space_id = ?",
    )
    .run(regular.id);
  expect(library.listSpaceItems(regular.id).map((item) => item.id)).toEqual(parity.regularSpace);
  expect(library.listItemSpaces("me-fuji-night")).toEqual([regular.id]);

  library.db
    .prepare(`INSERT INTO item_embeddings (item_id, kind, model, dimension, vector, created_at)
    VALUES (?, 'image', 'nomic-embed-vision-v1.5', 2, ?, 1)`)
    .run("me-fuji-night", vector([1, 0]));
  library.db
    .prepare(`INSERT INTO item_embeddings (item_id, kind, model, dimension, vector, created_at)
    VALUES (?, 'image', 'nomic-embed-vision-v1.5', 2, ?, 1)`)
    .run("me-lanterns", vector([0.8, 0.2]));
  expect(library.searchSimilar("me-fuji-night", "image").map((item) => item.id)).toEqual([
    "me-lanterns",
  ]);
  expect(library.searchSimilar("me-fuji-night", "image", 0)).toHaveLength(1);

  const note = library.createNote({ title: "Field notes", body: "## Evening\n\nWarm light." });
  expect(note.description).toBe("Evening Warm light.");
  expect(library.getItemContent(note.id)).toEqual({
    id: note.id,
    body: "## Evening\n\nWarm light.",
    bodyFormat: "md",
  });
  const updated = library.updateItem({ id: note.id, addTag: "#Reading", favorite: true });
  expect(updated.metadata.tags).toEqual(["reading"]);
  expect(updated.favorite).toBe(true);
  library.archiveItem(note.id);
  expect(library.listArchivedItems().map((item) => item.id)).toContain(note.id);
  library.archiveItem(note.id, false);
  expect(library.listActiveItems().map((item) => item.id)).toContain(note.id);
});

test("metadata patches preserve fields added after a URL was captured", () => {
  const { library } = temporaryLibrary();
  const item = library.createUrl({
    sourceUrl: "https://example.com/article",
    title: "Captured title",
    description: "",
    body: "",
    metadata: {
      captureSource: "browser extension",
      author: "Extension author",
      publishedDate: "2026-01-02",
      text: "",
    },
  });
  library.updateItem({ id: item.id, addTag: "reading" });

  const enriched = library.updateItem({
    id: item.id,
    metadataPatch: { text: "Extracted article text", extractedText: "Extracted article text" },
  });

  expect(enriched.metadata).toMatchObject({
    captureSource: "browser extension",
    author: "Extension author",
    publishedDate: "2026-01-02",
    tags: ["reading"],
    text: "Extracted article text",
    extractedText: "Extracted article text",
  });
});

test("Smart Space predicates are applied before the result limit", () => {
  const { library } = temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at, favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insert.run("newer-tag-miss", "article", "Tokyo winter", '{"tags":["other"]}', 30, 30, 1);
  insert.run("newer-favorite-miss", "url", "Tokyo summer", '{"tags":["japan"]}', 20, 20, 0);
  insert.run("older-match", "url", "Tokyo shrine", '{"tags":["Japan"]}', 10, 10, 1);
  const space = library.createSpace({
    name: "Tokyo reading",
    query: { text: "Tokyo", tag: "japan", favorite: true, kind: "article" },
  });

  expect(library.listSpaceItems(space.id, 1).map((item) => item.id)).toEqual(["older-match"]);

  insert.run("unicode-tag", "note", "Cafe notes", '{"tags":["café"]}', 5, 5, 1);
  const unicodeSpace = library.createSpace({ name: "Cafe", query: { tag: "CAFÉ" } });
  expect(library.listSpaceItems(unicodeSpace.id).map((item) => item.id)).toEqual(["unicode-tag"]);
});

test("LIKE fallback treats percent and underscore as literal search characters", () => {
  const { library } = temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items (id, kind, title, created_at, updated_at)
    VALUES (?, 'note', ?, ?, ?)`);
  insert.run("literal-percent", "100% organic", 1, 1);
  insert.run("wildcard-percent", "100 products", 2, 2);
  insert.run("literal-underscore", "file_name", 3, 3);
  insert.run("wildcard-underscore", "fileXname", 4, 4);
  library.fts5Enabled = false;

  expect(library.searchItems("100%").map((item) => item.id)).toEqual(["literal-percent"]);
  expect(library.searchItems("file_name").map((item) => item.id)).toEqual(["literal-underscore"]);
});

test("v7 libraries migrate note bodies, Space kind, jobs, and FTS to schema 8", () => {
  const { root } = temporaryLibrary();
  const databasePath = join(root, "v7.sqlite3");
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

  const migrated = trackedLibrary(databasePath);
  expect(migrated.status().schemaVersion).toBe(8);
  expect(migrated.getItemContent("legacy-note")).toEqual({
    id: "legacy-note",
    body: "Old body",
    bodyFormat: "md",
  });
  expect(migrated.getSpace("legacy-space")?.kind).toBe("smart");
  expect(migrated.searchItems("Old").map((item) => item.id)).toEqual(["legacy-note"]);
  expect(migrated.db.prepare("PRAGMA busy_timeout").get().timeout).toBe(5000);
});

test("job leases are owner-bound, renew for five minutes, and recover only after expiry", () => {
  const { library } = temporaryLibrary();
  const events: string[] = [];
  library.db
    .prepare(
      `INSERT INTO items (id, kind, created_at, updated_at) VALUES ('job-item', 'image', 1, 1)`,
    )
    .run();
  let now = 10_000;
  let clockCalls = 0;
  const queue = new JobQueue(library.db, {
    now: () => {
      clockCalls += 1;
      return now;
    },
    onUpdated: (itemId) => events.push(itemId),
  });
  const jobId = queue.enqueue("job-item", "ocr_image");
  expect(queue.enqueue("job-item", "ocr_image")).toBe(jobId);
  const claimed = queue.claimNext("worker-a");
  expect(claimed?.status).toBe("processing");
  expect(claimed?.startedAt).toBe(now);
  expect(queue.complete(jobId, "worker-b")).toBe(false);
  expect(queue.renew(jobId, "worker-a")).toBe(true);
  expect(
    library.db.prepare("SELECT lease_until FROM jobs WHERE id = ?").get(jobId).lease_until,
  ).toBe(now + JOB_LEASE_MILLIS);
  now += JOB_LEASE_MILLIS - 1;
  clockCalls = 0;
  expect(queue.recoverExpired()).toBe(0);
  expect(clockCalls).toBe(1);
  now += 2;
  clockCalls = 0;
  expect(queue.recoverExpired()).toBe(1);
  expect(clockCalls).toBe(1);
  expect(queue.getForItem("job-item")[0]?.status).toBe("pending");
  expect(queue.claimNext("worker-b")?.status).toBe("processing");
  expect(queue.fail(jobId, "worker-b", "temporary")).toBe(true);
  expect(queue.getForItem("job-item")[0]).toMatchObject({
    status: "pending",
    retryCount: 1,
    errorMessage: "temporary",
  });
  expect(queue.countActive()).toBe(1);
  expect(queue.claimNext("worker-c")?.status).toBe("processing");
  expect(queue.complete(jobId, "worker-c")).toBe(true);
  expect(queue.getForItem("job-item")[0]).toMatchObject({
    status: "completed",
    errorMessage: null,
  });
  expect(events).toEqual([
    "job-item",
    "job-item",
    "job-item",
    "job-item",
    "job-item",
    "job-item",
    "job-item",
    "job-item",
  ]);
});

test("file capture persists its item and asset before queued processing becomes visible", async () => {
  const { root, library } = temporaryLibrary();
  const item = await library.saveFile({
    fileName: "quick note.txt",
    mimeType: "text/plain",
    kind: "other",
    bytes: [...Buffer.from("captured immediately")],
  });

  expect(item).toMatchObject({
    kind: "file",
    localAssetPath: `assets/items/${item.id}/quick note.txt`,
  });
  expect(readFileSync(join(root, "assets", "items", item.id, "quick note.txt"), "utf8")).toBe(
    "captured immediately",
  );
  expect(library.jobs.getForItem(item.id)).toMatchObject([
    { kind: "generate_embedding", status: "pending" },
  ]);
  expect(library.jobs.countActive()).toBe(1);
});

test("image capture awaits asynchronous thumbnails and persists source dimensions", async () => {
  const { root, library } = temporaryLibrary({
    createThumbnail: async () => ({ bytes: Buffer.from("thumbnail"), width: 1200, height: 800 }),
  });
  const item = await library.saveFile({
    fileName: "photo.png",
    mimeType: "image/png",
    bytes: [...Buffer.from("source image")],
  });

  expect(item).toMatchObject({
    kind: "image",
    thumbnailPath: `assets/items/${item.id}/thumbnail.webp`,
    metadata: { mediaWidth: 1200, mediaHeight: 800 },
  });
  expect(readFileSync(join(root, "assets", "items", item.id, "thumbnail.webp"), "utf8")).toBe(
    "thumbnail",
  );
});

test("export snapshots and hashes assets; restore rejects tampering and imports the verified copy", async () => {
  const { root, library } = temporaryLibrary();
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

  const restored = trackedLibrary(join(root, "restored", "library.sqlite3"));
  const exportedAsset = join(report.directory, "assets", "items", "me-fuji-night", "reference.txt");
  writeFileSync(exportedAsset, "tampered");
  await expect(restored.importLibrary(report.directory)).rejects.toThrow("damaged asset");
  expect(restored.listActiveItems()).toEqual([]);

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
  expect(restored.getItem("me-fuji-night")?.localAssetPath).toBe(
    "assets/items/me-fuji-night/reference.txt",
  );
});

test("export counts and copies assets from the database snapshot", async () => {
  const { root, library } = temporaryLibrary();
  library.createNote({ title: "Before snapshot", body: "Present in the backup." });
  library.createSnapshot = async (_source, snapshotPath) => {
    library.db.prepare("VACUUM INTO ?").run(snapshotPath);
    library.createNote({ title: "After snapshot", body: "Not present in the backup." });
  };
  const destination = join(root, "exports");
  mkdirSync(destination);

  const report = await library.exportLibrary(destination, 0);
  const snapshot = trackDatabase(
    new DatabaseSync(join(report.directory, "library.sqlite3"), { readOnly: true }),
  );
  const snapshotCount = snapshot.prepare("SELECT COUNT(*) AS count FROM items").get().count;
  closeDatabase(snapshot);

  expect(library.listActiveItems()).toHaveLength(2);
  expect(report.items).toBe(1);
  expect(snapshotCount).toBe(1);
  expect(
    JSON.parse(readFileSync(join(report.directory, "manifest.json"), "utf8")).counts.items,
  ).toBe(1);
});

test("restore rejects item ids that could escape the managed asset directory", async () => {
  const { root, library } = temporaryLibrary();
  library.createNote({ title: "Safe note", body: "No assets." });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  const exportedDatabase = trackDatabase(
    new DatabaseSync(join(report.directory, "library.sqlite3")),
  );
  exportedDatabase.exec("DELETE FROM jobs");
  exportedDatabase.prepare("UPDATE items SET id = ?").run("../../outside");
  closeDatabase(exportedDatabase);

  const restored = trackedLibrary(join(root, "restored", "library.sqlite3"));
  await expect(restored.importLibrary(report.directory)).rejects.toThrow(
    "item id contains unsupported characters",
  );
  expect(restored.listActiveItems()).toEqual([]);
});

test("restore preserves Space kinds, ordering, and Regular Space membership", async () => {
  const { root, library } = temporaryLibrary();
  const item = library.createNote({
    title: "Japan reading list",
    body: "Find quiet places to stay.",
    metadata: { tags: ["japan"] },
  });
  const regular = library.createSpace({ name: "Read later", kind: "regular" });
  library.addSpaceItem(regular.id, item.id);
  library.createSpace({ name: "Japan", query: { tag: "japan" } });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);

  const restored = trackedLibrary(join(root, "restored", "library.sqlite3"));
  await restored.importLibrary(report.directory);

  expect(restored.listSpaces().map((space) => [space.name, space.kind])).toEqual([
    ["Read later", "regular"],
    ["Japan", "smart"],
  ]);
  expect(restored.listSpaceItems(regular.id).map((restoredItem) => restoredItem.id)).toEqual([
    item.id,
  ]);
  expect(
    restored.listSpaceItems(restored.listSpaces()[1].id).map((restoredItem) => restoredItem.id),
  ).toEqual([item.id]);
});

test("restore rejects unsupported Smart Space query fields", async () => {
  const { root, library } = temporaryLibrary();
  library.createSpace({ name: "Japan", query: { tag: "japan" } });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  const exportedDatabase = trackDatabase(
    new DatabaseSync(join(report.directory, "library.sqlite3")),
  );
  exportedDatabase.prepare("UPDATE spaces SET query = ?").run('{"future":"ignored"}');
  closeDatabase(exportedDatabase);

  const restored = trackedLibrary(join(root, "restored", "library.sqlite3"));
  await expect(restored.importLibrary(report.directory)).rejects.toThrow(
    "unsupported Space query field",
  );
  expect(restored.listSpaces()).toEqual([]);
});

test("restore removes staged assets when the active library rejects its transaction", async () => {
  const { root, library } = temporaryLibrary();
  const item = await library.saveFile({
    fileName: "reference.txt",
    mimeType: "text/plain",
    kind: "other",
    bytes: [...Buffer.from("verified local file")],
  });
  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);

  const restored = trackedLibrary(join(root, "restored", "library.sqlite3"));
  restored.db.exec(`CREATE TRIGGER reject_import BEFORE INSERT ON items BEGIN
    SELECT RAISE(ABORT, 'test import failure');
  END;`);
  await expect(restored.importLibrary(report.directory)).rejects.toThrow("test import failure");

  expect(restored.listActiveItems()).toEqual([]);
  expect(existsSync(join(root, "restored", "assets", "items", item.id))).toBe(false);
});

test("data directory keeps portable precedence and the Tauri app-data identity", () => {
  expect(
    resolveLibraryDataDirectory({
      executablePath: "/apps/inkling/inkling.exe",
      appDataDirectory: "/users/test/AppData/Roaming",
      portable: true,
    }),
  ).toBe("/apps/inkling/data");
  expect(
    resolveLibraryDataDirectory({
      executablePath: "/apps/inkling/inkling.exe",
      appDataDirectory: "/users/test/AppData/Roaming",
    }),
  ).toBe("/users/test/AppData/Roaming/com.inkling.library");
  expect(
    resolveLibraryDataDirectory({
      executablePath: "/apps/inkling/inkling.exe",
      appDataDirectory: "/users/test/AppData/Roaming",
      overrideDirectory: "/scratch/library",
    }),
  ).toBe("/scratch/library");
});

test("the Electron worker leaves Tauri-only processors queued instead of blocking capture", async () => {
  const { library } = temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('pending-item', 'pdf', 1, 1)",
    )
    .run();
  library.jobs.enqueue("pending-item", "ocr_pdf_page");
  const worker = new JobWorker(library, { processors: {} });
  await worker.pump();
  expect(library.jobs.getForItem("pending-item")[0]?.status).toBe("pending");
  expect(library.jobs.countActive()).toBe(1);
});
