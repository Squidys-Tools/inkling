import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { personalSeedItems } from "../src/seedPersonal";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.mjs";
import {
  JobQueue,
  JobWorker,
  JOB_LEASE_MILLIS,
  openLibraryStorage,
  PDF_THUMBNAIL_JOB,
  resolveLibraryDataDirectory,
  URL_ENRICHMENT_JOB,
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

test("completed onboarding persists across library reopen", () => {
  const { root, library } = temporaryLibrary();
  expect(library.hasCompletedOnboarding()).toBe(false);
  library.completeOnboarding();
  closeDatabase(library.db);
  expect(trackedLibrary(join(root, "library.sqlite3")).hasCompletedOnboarding()).toBe(true);
});

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

function enrichUrl(
  library: ReturnType<typeof openLibraryStorage>,
  itemId: string,
  article: object,
) {
  const workerId = `url-test-${randomUUID()}`;
  const job = library.jobs.claimNext(workerId);
  if (!job) throw new Error("URL enrichment job was not available");
  expect(job).toMatchObject({ itemId, kind: URL_ENRICHMENT_JOB, status: "processing" });
  expect(library.applyUrlEnrichment(job.id, workerId, article)).toBe(true);
  expect(library.jobs.complete(job.id, workerId)).toBe(true);
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
    VALUES (?, 'image', ?, 2, ?, 1)`)
    .run("me-fuji-night", IMAGE_MODEL, vector([1, 0]));
  library.db
    .prepare(`INSERT INTO item_embeddings (item_id, kind, model, dimension, vector, created_at)
    VALUES (?, 'image', ?, 2, ?, 1)`)
    .run("me-lanterns", IMAGE_MODEL, vector([0.8, 0.2]));
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

test("list rows keep card fields while full content stays available by item id", () => {
  const { library } = temporaryLibrary();
  const article = library.captureUrl({
    sourceUrl: "https://example.com/reader",
    captureSource: "quick link",
    title: "A saved article",
  });
  enrichUrl(library, article.id, {
    canonicalUrl: "https://example.com/reader",
    title: "An extracted title",
    description: "A short card summary.",
    text: "indextextneedle",
    html: "<article><p>indexhtmlneedle</p></article>",
    author: "A. Reader",
    publishedDate: "2026-10-18",
    extractor: "defuddle",
    imageUrls: [],
    imageDimensions: [],
    safeEmbeds: [],
  });
  library.updateItem({ id: article.id, addTag: "reading" });
  const note = library.createNote({ title: "A saved note", body: "Private note body." });
  library.db
    .prepare("UPDATE items SET ocr_text = ? WHERE id = ?")
    .run("OCR-PRIVATE-".repeat(100), article.id);
  library.storeEmbedding(article.id, "text", TEXT_MODEL, vector([1, 0]), 2);
  library.storeEmbedding(note.id, "text", TEXT_MODEL, vector([0.9, Math.sqrt(0.19)]), 2);
  const active = library.listActiveItems();
  const articleCard = active.find((item) => item.id === article.id);
  const noteCard = active.find((item) => item.id === note.id);

  expect(articleCard).toMatchObject({
    id: article.id,
    kind: "url",
    title: "A saved article",
    description: "A short card summary.",
    hasArticleContent: true,
    metadata: { tags: ["reading"], imageUrls: [], imageDimensions: [] },
  });
  expect(articleCard).not.toHaveProperty("body");
  expect(articleCard).not.toHaveProperty("bodyFormat");
  expect(articleCard).not.toHaveProperty("updatedAt");
  expect(articleCard?.ocrText).toHaveLength(180);
  expect(articleCard?.metadata).not.toHaveProperty("html");
  expect(articleCard?.metadata).not.toHaveProperty("text");
  expect(articleCard?.metadata).not.toHaveProperty("extractedText");
  expect(articleCard?.metadata).not.toHaveProperty("author");
  expect(articleCard?.metadata).not.toHaveProperty("publishedDate");
  expect(JSON.stringify(articleCard)).not.toContain("indexhtmlneedle");
  expect(JSON.stringify(articleCard)).not.toContain("indextextneedle");
  expect(noteCard).not.toHaveProperty("body");
  const htmlSearch = library.searchItems("indexhtmlneedle");
  const textSearch = library.searchItems("indextextneedle");
  const smartSpace = library.createSpace({ name: "Reading", query: { tag: "reading" } });
  const regularSpace = library.createSpace({ name: "Saved", kind: "regular" });
  library.addSpaceItem(regularSpace.id, article.id);
  expect(htmlSearch.map((item) => item.id)).toContain(article.id);
  expect(textSearch.map((item) => item.id)).toContain(article.id);
  expect(htmlSearch[0]).not.toHaveProperty("body");
  expect(htmlSearch[0]?.metadata).not.toHaveProperty("html");
  expect(htmlSearch[0]?.metadata).not.toHaveProperty("text");
  expect(library.listSpaceItems(smartSpace.id).map((item) => item.id)).toEqual([article.id]);
  expect(library.listSpaceItems(regularSpace.id).map((item) => item.id)).toEqual([article.id]);
  const similarItems = library.searchSimilar(article.id, "text");
  expect(similarItems.map((item) => item.id)).toEqual([note.id]);
  expect(similarItems[0]).not.toHaveProperty("body");
  library.fts5Enabled = false;
  const fallbackSearch = library.searchItems("indexhtmlneedle");
  expect(fallbackSearch.map((item) => item.id)).toContain(article.id);
  expect(fallbackSearch[0]).not.toHaveProperty("body");
  expect(fallbackSearch[0]?.metadata).not.toHaveProperty("html");
  library.fts5Enabled = true;
  library.archiveItem(article.id);
  const archivedCard = library.listArchivedItems().find((item) => item.id === article.id);
  expect(archivedCard?.metadata).not.toHaveProperty("html");
  expect(archivedCard?.hasArticleContent).toBe(true);
  expect(library.getItem(article.id)).toMatchObject({
    metadata: {
      html: "<article><p>indexhtmlneedle</p></article>",
      text: "indextextneedle",
      extractedText: "indextextneedle",
    },
  });
  expect(library.getItem(note.id)).toMatchObject({ body: "Private note body." });
  expect(library.getItem("missing-item")).toBeNull();
});

test("URL enrichment preserves a title and tags edited while extraction is queued", () => {
  const { library } = temporaryLibrary();
  const item = library.captureUrl({
    sourceUrl: "https://example.com/article",
    title: "Extension title",
    captureSource: "browser extension",
  });
  const workerId = `url-test-${randomUUID()}`;
  const job = library.jobs.claimNext(workerId);
  if (!job) throw new Error("URL enrichment job was not available");
  library.updateItem({ id: item.id, title: "Edited while loading", addTag: "reading" });
  expect(
    library.applyUrlEnrichment(job.id, workerId, {
      canonicalUrl: "https://example.com/canonical",
      title: "Article title",
      description: "Summary",
      text: "Extracted article text",
      html: "<article><p>Extracted article text</p></article>",
      author: "Article author",
      publishedDate: "2026-01-02",
      extractor: "defuddle",
      imageUrls: [],
      imageDimensions: [],
      safeEmbeds: [],
    }),
  ).toBe(true);
  expect(library.jobs.complete(job.id, workerId)).toBe(true);

  expect(library.getItem(item.id)).toMatchObject({
    title: "Edited while loading",
    sourceUrl: "https://example.com/canonical",
    metadata: {
      captureSource: "browser extension",
      tags: ["reading"],
      text: "Extracted article text",
      extractedText: "Extracted article text",
      author: "Article author",
      publishedDate: "2026-01-02",
    },
  });
});

test("URL capture commits the fallback item with a pending enrichment job", () => {
  const events: string[] = [];
  const { library } = temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
  });

  const item = library.captureUrl({
    sourceUrl: "https://example.com/article",
    captureSource: "quick link",
  });

  expect(item).toMatchObject({
    kind: "url",
    title: "example.com",
    description: null,
    sourceUrl: "https://example.com/article",
    sourceLabel: "example.com",
    metadata: { captureSource: "quick link", text: "", html: "" },
  });
  expect(library.jobs.getForItem(item.id)).toMatchObject([
    { kind: URL_ENRICHMENT_JOB, status: "pending" },
  ]);
  expect(events).toEqual([item.id]);
});

test("URL capture rolls back the item when its enrichment job cannot be queued", () => {
  const { library } = temporaryLibrary();
  library.jobs.enqueue = () => {
    throw new Error("queue unavailable");
  };

  expect(() =>
    library.captureUrl({ sourceUrl: "https://example.com/article", captureSource: "quick link" }),
  ).toThrow("queue unavailable");
  expect(library.db.prepare("SELECT COUNT(*) AS count FROM items").get().count).toBe(0);
  expect(library.db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count).toBe(0);
});

test("free-text search hybrid-ranks lexical and Nomic semantic matches", () => {
  const { library } = temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`);
  insert.run("lexical-match", "note", "violet galaxy", 1, 30);
  insert.run("semantic-text", "note", "night sky", 2, 20);
  insert.run("semantic-image", "image", "distant sun", 3, 10);
  insert.run("negative-match", "note", "antipodal", 4, 5);
  insert.run("legacy-image", "image", "old image vector", 5, 4);
  insert.run("archived-match", "note", "archived stars", 6, 3);

  library.storeEmbedding("lexical-match", "text", TEXT_MODEL, vector([0, 1]), 2);
  library.storeEmbedding("semantic-text", "text", TEXT_MODEL, vector([0.8, 0.6]), 2);
  library.storeEmbedding("semantic-image", "image", IMAGE_MODEL, vector([0.9, Math.sqrt(0.19)]), 2);
  library.storeEmbedding("negative-match", "text", TEXT_MODEL, vector([-1, 0]), 2);
  library.storeEmbedding("legacy-image", "image", "nomic-embed-vision-v1.5", vector([1, 0]), 2);
  library.storeEmbedding("archived-match", "text", TEXT_MODEL, vector([1, 0]), 2);
  library.archiveItem("archived-match");

  const queryVector = Float32Array.from([1, 0]);
  expect(library.searchItems("violet galaxy", 20, queryVector).map((item) => item.id)).toEqual([
    "lexical-match",
    "semantic-image",
    "semantic-text",
  ]);
  expect(library.searchItems("quiet telescope", 20, queryVector).map((item) => item.id)).toEqual([
    "semantic-image",
    "semantic-text",
  ]);
});

test("free-text search keeps lexical matches and drops weak semantic matches", () => {
  const { library } = temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`);
  insert.run("lexical-weak", "note", "zeppelin", 1, 10);
  insert.run("strong-semantic", "note", "airship history", 2, 20);
  insert.run("weak-semantic", "note", "bicycle repair", 3, 30);

  library.storeEmbedding("lexical-weak", "text", TEXT_MODEL, vector([0.2, Math.sqrt(0.96)]), 2);
  library.storeEmbedding("strong-semantic", "text", TEXT_MODEL, vector([0.9, Math.sqrt(0.19)]), 2);
  library.storeEmbedding("weak-semantic", "text", TEXT_MODEL, vector([0.5, Math.sqrt(0.75)]), 2);

  const queryVector = Float32Array.from([1, 0]);
  expect(library.searchItems("zeppelin", 20, queryVector).map((item) => item.id)).toEqual([
    "lexical-weak",
    "strong-semantic",
  ]);
  expect(library.searchItems("qwxzv bnmk", 20, queryVector).map((item) => item.id)).toEqual([
    "strong-semantic",
  ]);
  expect(library.searchItems("quiet telescope", 20, queryVector).map((item) => item.id)).toEqual([
    "strong-semantic",
  ]);
});

test("Smart Spaces apply saved filters to hybrid text-search candidates", () => {
  const { library } = temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, 'note', ?, ?, ?, ?)`);
  insert.run("space-lexical", "quiet telescope", '{"tags":["misc"]}', 1, 30);
  insert.run("space-semantic", "night sky", '{"tags":["astronomy"]}', 2, 20);
  insert.run("space-wrong-tag", "distant galaxy", '{"tags":["misc"]}', 3, 10);
  library.storeEmbedding("space-lexical", "text", TEXT_MODEL, vector([0, 1]), 2);
  library.storeEmbedding("space-semantic", "text", TEXT_MODEL, vector([1, 0]), 2);
  library.storeEmbedding("space-wrong-tag", "text", TEXT_MODEL, vector([0.99, 0.1]), 2);
  const space = library.createSpace({
    name: "Astronomy",
    query: { text: "quiet telescope", tag: "astronomy" },
  });

  expect(library.listSpaceItems(space.id).map((item) => item.id)).toEqual([]);
  expect(
    library.listSpaceItems(space.id, 100, Float32Array.from([1, 0])).map((item) => item.id),
  ).toEqual(["space-semantic"]);
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

test("exclusive startup resumes interrupted URL work without stealing other live jobs", () => {
  const now = 10_000;
  const { library } = temporaryLibrary({ jobQueue: { now: () => now } });
  const url = library.captureUrl({
    sourceUrl: "https://example.com/article",
    captureSource: "quick link",
  });
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('live-image', 'image', 1, 1)",
    )
    .run();
  const imageJobId = library.jobs.enqueue("live-image", "ocr_image");
  const urlJobId = library.jobs.getForItem(url.id)[0]?.id;
  if (!urlJobId) throw new Error("URL enrichment job was not created");
  library.db
    .prepare("UPDATE jobs SET status = 'processing', worker_id = ?, lease_until = ? WHERE id = ?")
    .run("stopped-worker", now + JOB_LEASE_MILLIS, urlJobId);
  library.db
    .prepare("UPDATE jobs SET status = 'processing', worker_id = ?, lease_until = ? WHERE id = ?")
    .run("live-worker", now + JOB_LEASE_MILLIS, imageJobId);

  expect(library.jobs.recoverUrlEnrichmentAfterExclusiveStartup()).toBe(1);
  expect(library.jobs.getForItem(url.id)[0]).toMatchObject({
    status: "pending",
    retryCount: 0,
  });
  expect(
    library.db.prepare("SELECT status, worker_id FROM jobs WHERE id = ?").get(imageJobId),
  ).toEqual({
    status: "processing",
    worker_id: "live-worker",
  });
  expect(library.jobs.recoverExpired()).toBe(0);
  expect(library.jobs.claimNext("restarted-worker")?.itemId).toBe(url.id);
});

test("manual retry restores the full retry budget", () => {
  const { library } = temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('retry-item', 'image', 1, 1)",
    )
    .run();
  const queue = library.jobs;
  const jobId = queue.enqueue("retry-item", "ocr_image");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    expect(queue.claimNext("retry-worker")?.id).toBe(jobId);
    expect(queue.fail(jobId, "retry-worker", "temporary failure")).toBe(true);
  }
  expect(queue.getForItem("retry-item")[0]).toMatchObject({ status: "failed", retryCount: 3 });

  expect(queue.retry(jobId)).toBe(true);
  expect(queue.getForItem("retry-item")[0]).toMatchObject({ status: "pending", retryCount: 0 });
  expect(queue.claimNext("retry-worker")?.id).toBe(jobId);
  expect(queue.fail(jobId, "retry-worker", "temporary failure")).toBe(true);
  expect(queue.getForItem("retry-item")[0]).toMatchObject({ status: "pending", retryCount: 1 });
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

test("data directory keeps portable precedence and the product app-data identity", () => {
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

test("the Electron worker leaves unregistered processors queued instead of blocking capture", async () => {
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

test("stopping the Electron worker waits for its active job and leaves later work queued", async () => {
  const { library } = temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('first-item', 'note', 1, 1), ('next-item', 'note', 2, 2)",
    )
    .run();
  library.jobs.enqueue("first-item", "blocked");
  library.jobs.enqueue("next-item", "blocked");

  let signalStarted!: () => void;
  let releaseJob!: () => void;
  const started = new Promise<void>((resolve) => (signalStarted = resolve));
  const blocked = new Promise<void>((resolve) => (releaseJob = resolve));
  let processed = 0;
  const worker = new JobWorker(library, {
    processors: {
      blocked: async () => {
        processed += 1;
        signalStarted();
        await blocked;
      },
    },
  });

  const pumping = worker.pump();
  await started;
  let stopped = false;
  const stopping = worker.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);

  releaseJob();
  await Promise.all([pumping, stopping]);

  expect(processed).toBe(1);
  expect(
    library.jobs
      .getForItems(["first-item", "next-item"])
      .filter((job) => job.kind === "blocked")
      .map((job) => job.status)
      .sort(),
  ).toEqual(["completed", "pending"]);
});

test("silent thumbnail jobs never appear in summaries, counts, or lifecycle events", () => {
  const { library } = temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('quiet-item', 'pdf', 1, 1)",
    )
    .run();
  let now = 10_000;
  const events: string[] = [];
  const queue = new JobQueue(library.db, { now: () => now, onUpdated: (id) => events.push(id) });

  const jobId = queue.enqueue("quiet-item", PDF_THUMBNAIL_JOB);
  queue.claimNext("worker-a");
  queue.renew(jobId, "worker-a");
  queue.updateProgress(jobId, "worker-a", 1, 2, "halfway");
  queue.fail(jobId, "worker-a", "retrying");
  queue.claimNext("worker-a");
  now += JOB_LEASE_MILLIS + 1;
  queue.recoverExpired();
  queue.claimNext("worker-b");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    queue.fail(jobId, "worker-b", "broken");
    queue.claimNext("worker-b");
  }
  queue.fail(jobId, "worker-b", "terminal");
  queue.retry(jobId);
  queue.claimNext("worker-b");
  queue.complete(jobId, "worker-b");

  expect(events).toEqual([]);
  expect(queue.getForItem("quiet-item")).toEqual([]);
  expect(queue.getForItems(["quiet-item"])).toEqual([]);
  expect(queue.countActive()).toBe(0);
  expect(library.db.prepare("SELECT status FROM jobs WHERE id = ?").get(jobId)).toEqual({
    status: "completed",
  });
});

test("the worker admits idle work only when nothing processable is pending and drains it without polling", async () => {
  const { library } = temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('a', 'note', 1, 1), ('b', 'note', 2, 2)",
    )
    .run();
  library.jobs.enqueue("a", "queued");
  library.jobs.enqueue("b", "unregistered");
  const order: string[] = [];
  let idleCalls = 0;
  const worker = new JobWorker(library, {
    processors: {
      queued: async (job) => void order.push(`queued:${job.itemId}`),
      idle: async (job) => void order.push(`idle:${job.itemId}`),
    },
    onIdle: () => {
      idleCalls += 1;
      if (idleCalls <= 2) library.jobs.enqueue("a", "idle");
    },
  });
  await worker.pump();
  await worker.stop();

  expect(order).toEqual(["queued:a", "idle:a", "idle:a"]);
  expect(idleCalls).toBe(3);
  expect(library.jobs.getForItem("b")[0]?.status).toBe("pending");
});

test("PDF thumbnails publish once, touch only thumbnail_path, and survive export and restore", async () => {
  let encoded = 0;
  const { root, library } = temporaryLibrary({
    createThumbnail: async () => {
      encoded += 1;
      return { bytes: Buffer.from("page one"), width: 396, height: 512 };
    },
  });
  const pdf = await library.saveFile({
    fileName: "paper.pdf",
    mimeType: "application/pdf",
    bytes: [...Buffer.from("%PDF-1.4")],
  });
  const note = library.createNote({ title: "Not a PDF", body: "text" });
  const before = library.getItem(pdf.id);
  const ftsBefore = library.searchItems("paper").map((item) => item.id);
  const indexedRow = (id: string) =>
    library.db.prepare("SELECT * FROM items_fts WHERE item_id = ?").all(id);
  const writes = () => ({
    fts: indexedRow(pdf.id),
    embeddings: library.db.prepare("SELECT * FROM item_embeddings").all(),
    jobs: library.db.prepare("SELECT id, kind, status FROM jobs ORDER BY id").all(),
  });
  const writesBefore = writes();

  expect(await library.storePdfThumbnail(note.id, Buffer.from("png"))).toBe(false);
  expect(await library.storePdfThumbnail("missing", Buffer.from("png"))).toBe(false);
  expect(await library.storePdfThumbnail(pdf.id, Buffer.from("png"))).toBe(true);
  expect(await library.storePdfThumbnail(pdf.id, Buffer.from("png"))).toBe(false);
  expect(encoded).toBe(1);

  expect(library.getItem(pdf.id)).toEqual({
    ...before,
    thumbnailPath: `assets/items/${pdf.id}/thumbnail.webp`,
  });
  expect(library.searchItems("paper").map((item) => item.id)).toEqual(ftsBefore);
  expect(ftsBefore).toEqual([pdf.id]);
  expect(writes()).toEqual(writesBefore);
  expect(readdirSync(root).filter((name) => name.startsWith(".inkling-thumbnail-"))).toEqual([]);

  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  const restored = trackedLibrary(join(root, "restored", "library.sqlite3"));
  await restored.importLibrary(report.directory);
  expect(restored.getItem(pdf.id)?.thumbnailPath).toBe(`assets/items/${pdf.id}/thumbnail.webp`);
  expect(
    readFileSync(join(root, "restored", "assets", "items", pdf.id, "thumbnail.webp"), "utf8"),
  ).toBe("page one");
});

test("PDF thumbnail candidates walk the kind index by rowid without sorting and skip failed or assetless PDFs", () => {
  const { library } = temporaryLibrary();
  const insert = library.db.prepare(
    "INSERT INTO items (id, kind, local_asset_path, thumbnail_path, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)",
  );
  insert.run("done", "pdf", "assets/items/done/a.pdf", "assets/items/done/thumbnail.webp");
  insert.run("assetless", "pdf", null, null);
  insert.run("image", "image", "assets/items/image/a.png", null);
  insert.run("broken", "pdf", "assets/items/broken/a.pdf", null);
  insert.run("first", "pdf", "assets/items/first/a.pdf", null);
  insert.run("last", "pdf", "assets/items/last/a.pdf", null);
  const jobId = library.jobs.enqueue("broken", PDF_THUMBNAIL_JOB);
  library.db.prepare("UPDATE jobs SET status = 'failed' WHERE id = ?").run(jobId);

  const prepared: string[] = [];
  const prepare = library.db.prepare.bind(library.db);
  library.db.prepare = (sql: string) => {
    prepared.push(sql);
    return prepare(sql);
  };
  const firstCandidate = library.nextPdfThumbnailCandidate(0);
  library.db.prepare = prepare;
  expect(firstCandidate?.id).toBe("first");
  expect(library.nextPdfThumbnailCandidate(firstCandidate.rowid)?.id).toBe("last");
  expect(
    library.nextPdfThumbnailCandidate(
      library.nextPdfThumbnailCandidate(firstCandidate.rowid).rowid,
    ),
  ).toBeUndefined();

  const plan = library.db
    .prepare(`EXPLAIN QUERY PLAN ${prepared[0]}`)
    .all(0, PDF_THUMBNAIL_JOB)
    .map((row) => row.detail as string);
  expect(
    plan.some((detail) => detail.includes("USING INDEX idx_items_kind (kind=? AND rowid>?)")),
  ).toBe(true);
  expect(plan.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
});
