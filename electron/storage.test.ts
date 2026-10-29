import { afterAll, afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
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
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Duration, Effect } from "effect";
import { SqlClient } from "effect/sql";
import { personalSeedItems } from "../src/seedPersonal";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.ts";
import parity from "./fixtures/storage-parity.json";
import { pdfThumbnailCandidateSql } from "./storage/enrichment.ts";
import { storageFailure } from "./storage/errors.ts";
import {
  IMAGE_THUMBNAIL_JOB,
  JOB_LEASE_MILLIS,
  type LibraryOptions,
  PDF_THUMBNAIL_JOB,
  resolveLibraryDataDirectory,
  URL_ENRICHMENT_JOB,
} from "./storage/library.ts";
import { openTestLibrary, type TestLibrary } from "./storage/test-library.ts";

type Options = Omit<LibraryOptions, "databasePath">;

const roots: string[] = [];
const libraries = new Set<TestLibrary>();
const databases = new Set<DatabaseSync>();

async function trackedLibrary(path: string, options: Options = {}) {
  const library = await openTestLibrary(path, options);
  libraries.add(library);
  return library;
}

async function closeLibrary(library: TestLibrary) {
  libraries.delete(library);
  await library.close();
}

async function temporaryLibrary(options: Options = {}) {
  const root = mkdtempSync(join(tmpdir(), "inkling-electron-storage-"));
  roots.push(root);
  return { root, library: await trackedLibrary(join(root, "library.sqlite3"), options) };
}

function trackDatabase(database: DatabaseSync) {
  databases.add(database);
  return database;
}

function closeDatabase(database: DatabaseSync) {
  databases.delete(database);
  database.close();
}

const count = (library: TestLibrary, table: string) =>
  Number(library.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count);

async function enrichUrl(library: TestLibrary, itemId: string, article: object) {
  const workerId = `url-test-${randomUUID()}`;
  const job = await library.jobs.claimNext(workerId);
  if (!job) throw new Error("URL enrichment job was not available");
  expect(job).toMatchObject({ itemId, kind: URL_ENRICHMENT_JOB, status: "processing" });
  expect(await library.applyUrlEnrichment(job.id, workerId, article)).toBe(true);
  expect(await library.jobs.complete(job.id, workerId)).toBe(true);
}

function seedFromDemo(library: TestLibrary) {
  const selected = personalSeedItems.filter((item) => parity.sourceIds.includes(String(item.id)));
  const insert = library.db
    .prepare(`INSERT INTO items (id, kind, title, description, body, body_format,
    source_label, metadata, ocr_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', 'md', 'Downloads', ?, '', ?, ?)`);
  selected.forEach((item, index) => {
    const now = index + 1;
    insert.run(
      item.id,
      item.kind.toLowerCase(),
      item.title,
      item.description,
      JSON.stringify({ tags: item.tags }),
      now,
      now,
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

const ids = (items: { id: string }[]) => items.map((item) => item.id);

afterEach(async () => {
  for (const library of libraries) await library.close();
  libraries.clear();
  for (const database of databases) database.close();
  databases.clear();
  Bun.gc(true);
});

afterAll(() => {
  Bun.gc(true);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("completed onboarding persists across library reopen", async () => {
  const { root, library } = await temporaryLibrary();
  expect(await library.hasCompletedOnboarding()).toBe(false);
  await library.completeOnboarding();
  await closeLibrary(library);
  const reopened = await trackedLibrary(join(root, "library.sqlite3"));
  expect(await reopened.hasCompletedOnboarding()).toBe(true);
});

test("demo-seed search, Smart Space, Regular Space, CRUD, and semantic ranking match goldens", async () => {
  const { root, library } = await temporaryLibrary();
  seedFromDemo(library);

  expect(library.status().fts5Enabled).toBe(true);
  expect(ids(await library.listActiveItems())).toEqual(parity.activeOrder);
  expect(ids(await library.searchItems("lanterns"))).toEqual(parity.queries.lanterns);
  expect(ids(await library.searchItems("japan"))).toEqual(parity.queries.japan);
  expect(await library.searchItems("japan", 0)).toHaveLength(1);
  const withoutFts = await trackedLibrary(join(root, "library.sqlite3"), { useFts5: false });
  expect(ids(await withoutFts.searchItems("japan"))).toEqual(parity.queries.japan);

  const smart = await library.createSpace({ name: "Japan", query: { tag: "japan" } });
  const regular = await library.createSpace({
    name: "Weekend",
    kind: "regular",
    query: { text: "ignored" },
  });
  if (!smart || !regular) throw new Error("Spaces were not created");
  expect(ids(await library.listSpaceItems(smart.id))).toEqual(parity.smartSpace);
  await library.addSpaceItem(regular.id, "me-fuji-night");
  await library.addSpaceItem(regular.id, "me-lanterns");
  await library.updateSpace({ id: regular.id, color: "yellow" });
  const spaces = await library.listSpaces();
  expect(spaces).toMatchObject([
    { id: smart.id, kind: "smart" },
    { id: regular.id, kind: "regular", color: "yellow", itemCount: 2 },
  ]);
  expect(spaces[0]).not.toHaveProperty("itemCount");
  expect(await library.listSpaceItems(regular.id, 0)).toHaveLength(1);
  library.db
    .prepare(
      "UPDATE space_items SET added_at = CASE item_id WHEN 'me-fuji-night' THEN 1 ELSE 2 END WHERE space_id = ?",
    )
    .run(regular.id);
  expect(ids(await library.listSpaceItems(regular.id))).toEqual(parity.regularSpace);
  expect(await library.listItemSpaces("me-fuji-night")).toEqual([regular.id]);

  const insertEmbedding = library.db.prepare(`INSERT INTO item_embeddings
    (item_id, kind, model, dimension, vector, created_at) VALUES (?, 'image', ?, 2, ?, 1)`);
  insertEmbedding.run("me-fuji-night", IMAGE_MODEL, vector([1, 0]));
  insertEmbedding.run("me-lanterns", IMAGE_MODEL, vector([0.8, 0.2]));
  expect(ids(await library.searchSimilar("me-fuji-night", "image"))).toEqual(["me-lanterns"]);
  expect(await library.searchSimilar("me-fuji-night", "image", 0)).toHaveLength(1);

  const note = await library.createNote({
    title: "Field notes",
    body: "## Evening\n\nWarm light.",
  });
  if (!note) throw new Error("note was not created");
  expect(note.description).toBe("Evening Warm light.");
  expect(await library.getItemContent(note.id)).toEqual({
    id: note.id,
    body: "## Evening\n\nWarm light.",
    bodyFormat: "md",
  });
  const updated = await library.updateItem({ id: note.id, addTag: "#Reading" });
  expect(updated?.metadata.tags).toEqual(["reading"]);
  await library.archiveItem(note.id);
  expect(ids(await library.listArchivedItems())).toContain(note.id);
  await library.archiveItem(note.id, false);
  expect(ids(await library.listActiveItems())).toContain(note.id);
});

test("list rows keep card fields while full content stays available by item id", async () => {
  const { root, library } = await temporaryLibrary();
  const article = await library.captureUrl({
    sourceUrl: "https://example.com/reader",
    captureSource: "quick link",
    title: "A saved article",
  });
  if (!article) throw new Error("article was not captured");
  await enrichUrl(library, article.id, {
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
  await library.updateItem({ id: article.id, addTag: "reading" });
  const note = await library.createNote({ title: "A saved note", body: "Private note body." });
  if (!note) throw new Error("note was not created");
  library.db
    .prepare("UPDATE items SET ocr_text = ? WHERE id = ?")
    .run("OCR-PRIVATE-".repeat(100), article.id);
  await library.storeEmbedding(article.id, "text", TEXT_MODEL, vector([1, 0]), 2);
  await library.storeEmbedding(note.id, "text", TEXT_MODEL, vector([0.9, Math.sqrt(0.19)]), 2);
  const active = await library.listActiveItems();
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
  for (const field of ["html", "text", "extractedText", "author", "publishedDate"]) {
    expect(articleCard?.metadata).not.toHaveProperty(field);
  }
  expect(JSON.stringify(articleCard)).not.toContain("indexhtmlneedle");
  expect(JSON.stringify(articleCard)).not.toContain("indextextneedle");
  expect(noteCard).not.toHaveProperty("body");
  const htmlSearch = await library.searchItems("indexhtmlneedle");
  const textSearch = await library.searchItems("indextextneedle");
  const smartSpace = await library.createSpace({ name: "Reading", query: { tag: "reading" } });
  const regularSpace = await library.createSpace({ name: "Saved", kind: "regular" });
  if (!smartSpace || !regularSpace) throw new Error("Spaces were not created");
  await library.addSpaceItem(regularSpace.id, article.id);
  expect(ids(htmlSearch)).toContain(article.id);
  expect(ids(textSearch)).toContain(article.id);
  expect(htmlSearch[0]).not.toHaveProperty("body");
  expect(htmlSearch[0]?.metadata).not.toHaveProperty("html");
  expect(htmlSearch[0]?.metadata).not.toHaveProperty("text");
  expect(ids(await library.listSpaceItems(smartSpace.id))).toEqual([article.id]);
  expect(ids(await library.listSpaceItems(regularSpace.id))).toEqual([article.id]);
  const similarItems = await library.searchSimilar(article.id, "text");
  expect(ids(similarItems)).toEqual([note.id]);
  expect(similarItems[0]).not.toHaveProperty("body");
  const withoutFts = await trackedLibrary(join(root, "library.sqlite3"), { useFts5: false });
  const fallbackSearch = await withoutFts.searchItems("indexhtmlneedle");
  expect(ids(fallbackSearch)).toContain(article.id);
  expect(fallbackSearch[0]).not.toHaveProperty("body");
  expect(fallbackSearch[0]?.metadata).not.toHaveProperty("html");
  await library.archiveItem(article.id);
  const archivedCard = (await library.listArchivedItems()).find((item) => item.id === article.id);
  expect(archivedCard?.metadata).not.toHaveProperty("html");
  expect(archivedCard?.hasArticleContent).toBe(true);
  expect(await library.getItem(article.id)).toMatchObject({
    metadata: {
      html: "<article><p>indexhtmlneedle</p></article>",
      text: "indextextneedle",
      extractedText: "indextextneedle",
    },
  });
  expect(await library.getItem(note.id)).toMatchObject({ body: "Private note body." });
  expect(await library.getItem("missing-item")).toBeNull();
});

test("URL enrichment preserves a title and tags edited while extraction is queued", async () => {
  const { library } = await temporaryLibrary();
  const item = await library.captureUrl({
    sourceUrl: "https://example.com/article",
    title: "Extension title",
    captureSource: "browser extension",
  });
  if (!item) throw new Error("URL was not captured");
  const workerId = `url-test-${randomUUID()}`;
  const job = await library.jobs.claimNext(workerId);
  if (!job) throw new Error("URL enrichment job was not available");
  await library.updateItem({ id: item.id, title: "Edited while loading", addTag: "reading" });
  expect(
    await library.applyUrlEnrichment(job.id, workerId, {
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
  expect(await library.jobs.complete(job.id, workerId)).toBe(true);

  expect(await library.getItem(item.id)).toMatchObject({
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

test("URL capture commits the fallback item with a pending enrichment job", async () => {
  const events: string[] = [];
  const { library } = await temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
  });

  const item = await library.captureUrl({
    sourceUrl: "https://example.com/article",
    captureSource: "quick link",
  });
  if (!item) throw new Error("URL was not captured");

  expect(item).toMatchObject({
    kind: "url",
    title: "example.com",
    description: null,
    sourceUrl: "https://example.com/article",
    sourceLabel: "example.com",
    metadata: { captureSource: "quick link", text: "", html: "" },
  });
  expect(await library.jobs.getForItem(item.id)).toMatchObject([
    { kind: URL_ENRICHMENT_JOB, status: "pending" },
  ]);
  expect(events).toEqual([item.id]);
});

test("URL capture rolls back the item and its announcement when its job cannot be queued", async () => {
  const events: string[] = [];
  const { library } = await temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
  });
  library.db.exec(`CREATE TRIGGER reject_jobs BEFORE INSERT ON jobs BEGIN
    SELECT RAISE(ABORT, 'queue unavailable');
  END;`);

  await expect(
    library.captureUrl({ sourceUrl: "https://example.com/article", captureSource: "quick link" }),
  ).rejects.toThrow("queue unavailable");
  expect(count(library, "items")).toBe(0);
  expect(count(library, "jobs")).toBe(0);
  expect(events).toEqual([]);
});

test("update_item refuses a source URL that is not HTTP or HTTPS", async () => {
  const { library } = await temporaryLibrary();
  const note = await library.createNote({ title: "Saved", body: "Body" });
  if (!note) throw new Error("note was not created");

  await expect(
    library.updateItem({ id: note.id, sourceUrl: "javascript:alert(1)" }),
  ).rejects.toThrow("sourceUrl must use HTTP or HTTPS");
  expect((await library.getItem(note.id))?.sourceUrl).toBeNull();
});

test("free-text search hybrid-ranks lexical and Nomic semantic matches", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`);
  insert.run("lexical-match", "note", "violet galaxy", 1, 30);
  insert.run("semantic-text", "note", "night sky", 2, 20);
  insert.run("semantic-image", "image", "distant sun", 3, 10);
  insert.run("negative-match", "note", "antipodal", 4, 5);
  insert.run("legacy-image", "image", "old image vector", 5, 4);
  insert.run("archived-match", "note", "archived stars", 6, 3);

  await library.storeEmbedding("lexical-match", "text", TEXT_MODEL, vector([0, 1]), 2);
  await library.storeEmbedding("semantic-text", "text", TEXT_MODEL, vector([0.8, 0.6]), 2);
  await library.storeEmbedding(
    "semantic-image",
    "image",
    IMAGE_MODEL,
    vector([0.9, Math.sqrt(0.19)]),
    2,
  );
  await library.storeEmbedding("negative-match", "text", TEXT_MODEL, vector([-1, 0]), 2);
  await library.storeEmbedding(
    "legacy-image",
    "image",
    "nomic-embed-vision-v1.5",
    vector([1, 0]),
    2,
  );
  await library.storeEmbedding("archived-match", "text", TEXT_MODEL, vector([1, 0]), 2);
  await library.archiveItem("archived-match");

  const queryVector = Float32Array.from([1, 0]);
  expect(ids(await library.searchItems("violet galaxy", 20, queryVector))).toEqual([
    "lexical-match",
    "semantic-image",
    "semantic-text",
  ]);
  expect(ids(await library.searchItems("quiet telescope", 20, queryVector))).toEqual([
    "semantic-image",
    "semantic-text",
  ]);
});

test("free-text search keeps lexical matches and drops weak semantic matches", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(`INSERT INTO items
    (id, kind, title, metadata, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`);
  insert.run("lexical-weak", "note", "zeppelin", 1, 10);
  insert.run("strong-semantic", "note", "airship history", 2, 20);
  insert.run("weak-semantic", "note", "bicycle repair", 3, 30);

  await library.storeEmbedding(
    "lexical-weak",
    "text",
    TEXT_MODEL,
    vector([0.2, Math.sqrt(0.96)]),
    2,
  );
  await library.storeEmbedding(
    "strong-semantic",
    "text",
    TEXT_MODEL,
    vector([0.9, Math.sqrt(0.19)]),
    2,
  );
  await library.storeEmbedding(
    "weak-semantic",
    "text",
    TEXT_MODEL,
    vector([0.5, Math.sqrt(0.75)]),
    2,
  );

  const queryVector = Float32Array.from([1, 0]);
  expect(ids(await library.searchItems("zeppelin", 20, queryVector))).toEqual([
    "lexical-weak",
    "strong-semantic",
  ]);
  expect(ids(await library.searchItems("qwxzv bnmk", 20, queryVector))).toEqual([
    "strong-semantic",
  ]);
  expect(ids(await library.searchItems("quiet telescope", 20, queryVector))).toEqual([
    "strong-semantic",
  ]);
});

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
  if (!space) throw new Error("Space was not created");

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
  if (!space) throw new Error("Space was not created");

  expect(ids(await library.listSpaceItems(space.id, 1))).toEqual(["older-match"]);

  insert.run("unicode-tag", "note", "Cafe notes", '{"tags":["café"]}', 5, 5);
  const unicodeSpace = await library.createSpace({ name: "Cafe", query: { tag: "CAFÉ" } });
  if (!unicodeSpace) throw new Error("Space was not created");
  expect(ids(await library.listSpaceItems(unicodeSpace.id))).toEqual(["unicode-tag"]);
});

test("LIKE fallback treats percent and underscore as literal search characters", async () => {
  const { library } = await temporaryLibrary({ useFts5: false });
  const insert = library.db.prepare(`INSERT INTO items (id, kind, title, created_at, updated_at)
    VALUES (?, 'note', ?, ?, ?)`);
  insert.run("literal-percent", "100% organic", 1, 1);
  insert.run("wildcard-percent", "100 products", 2, 2);
  insert.run("literal-underscore", "file_name", 3, 3);
  insert.run("wildcard-underscore", "fileXname", 4, 4);

  expect(ids(await library.searchItems("100%"))).toEqual(["literal-percent"]);
  expect(ids(await library.searchItems("file_name"))).toEqual(["literal-underscore"]);
});

test("v7 libraries migrate note bodies, Space kind, jobs, and FTS to schema 8", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-electron-storage-"));
  roots.push(root);
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

  const migrated = await trackedLibrary(databasePath);
  expect(migrated.status().schemaVersion).toBe(9);
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

test("job leases are owner-bound, renew for five minutes, and recover only after expiry", async () => {
  const events: string[] = [];
  let now = 10_000;
  let clockCalls = 0;
  const { library } = await temporaryLibrary({
    jobQueue: {
      now: () => {
        clockCalls += 1;
        return now;
      },
      onUpdated: (itemId) => events.push(itemId),
    },
  });
  library.db
    .prepare(
      `INSERT INTO items (id, kind, created_at, updated_at) VALUES ('job-item', 'image', 1, 1)`,
    )
    .run();
  const queue = library.jobs;
  const jobId = await queue.enqueue("job-item", "ocr_image");
  expect(await queue.enqueue("job-item", "ocr_image")).toBe(jobId);
  const claimed = await queue.claimNext("worker-a");
  expect(claimed?.status).toBe("processing");
  expect(claimed?.startedAt).toBe(now);
  expect(await queue.complete(jobId, "worker-b")).toBe(false);
  expect(await queue.renew(jobId, "worker-a")).toBe(true);
  expect(
    library.db.prepare("SELECT lease_until FROM jobs WHERE id = ?").get(jobId)?.lease_until,
  ).toBe(now + JOB_LEASE_MILLIS);
  now += JOB_LEASE_MILLIS - 1;
  clockCalls = 0;
  expect(await queue.recoverExpired()).toBe(0);
  expect(clockCalls).toBe(1);
  now += 2;
  clockCalls = 0;
  expect(await queue.recoverExpired()).toBe(1);
  expect(clockCalls).toBe(1);
  expect((await queue.getForItem("job-item"))[0]?.status).toBe("pending");
  expect((await queue.claimNext("worker-b"))?.status).toBe("processing");
  expect(await queue.fail(jobId, "worker-b", "temporary")).toBe(true);
  expect((await queue.getForItem("job-item"))[0]).toMatchObject({
    status: "pending",
    retryCount: 1,
    errorMessage: "temporary",
  });
  expect(await queue.countActive()).toBe(1);
  expect((await queue.claimNext("worker-c"))?.status).toBe("processing");
  expect(await queue.complete(jobId, "worker-c")).toBe(true);
  expect((await queue.getForItem("job-item"))[0]).toMatchObject({
    status: "completed",
    errorMessage: null,
  });
  expect(events).toEqual(Array(8).fill("job-item"));
});

test("exclusive startup hands back every job a previous run left processing", async () => {
  const now = 10_000;
  const { library } = await temporaryLibrary({ jobQueue: { now: () => now } });
  const url = await library.captureUrl({
    sourceUrl: "https://example.com/article",
    captureSource: "quick link",
  });
  if (!url) throw new Error("URL was not captured");
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('orphan-image', 'image', 1, 1)",
    )
    .run();
  const imageJobId = await library.jobs.enqueue("orphan-image", "ocr_image");
  const urlJobId = (await library.jobs.getForItem(url.id))[0]?.id;
  if (!urlJobId) throw new Error("URL enrichment job was not created");
  // Both leases are still live: the process that owned them is simply gone.
  library.db
    .prepare(
      "UPDATE jobs SET status = 'processing', worker_id = ?, lease_until = ? WHERE id IN (?, ?)",
    )
    .run("stopped-worker", now + JOB_LEASE_MILLIS, urlJobId, imageJobId);

  expect(await library.jobs.recoverExpired()).toBe(0);
  expect(await library.jobs.recoverAfterExclusiveStartup()).toBe(2);
  expect(
    library.db.prepare("SELECT status, worker_id, retry_count FROM jobs ORDER BY id").all(),
  ).toEqual([
    { status: "pending", worker_id: null, retry_count: 0 },
    { status: "pending", worker_id: null, retry_count: 0 },
  ]);
});

test("manual retry restores the full retry budget", async () => {
  const { library } = await temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('retry-item', 'image', 1, 1)",
    )
    .run();
  const queue = library.jobs;
  const jobId = await queue.enqueue("retry-item", "ocr_image");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    expect((await queue.claimNext("retry-worker"))?.id).toBe(jobId);
    expect(await queue.fail(jobId, "retry-worker", "temporary failure")).toBe(true);
  }
  expect((await queue.getForItem("retry-item"))[0]).toMatchObject({
    status: "failed",
    retryCount: 3,
  });

  expect(await queue.retry(jobId)).toBe(true);
  expect((await queue.getForItem("retry-item"))[0]).toMatchObject({
    status: "pending",
    retryCount: 0,
  });
  expect((await queue.claimNext("retry-worker"))?.id).toBe(jobId);
  expect(await queue.fail(jobId, "retry-worker", "temporary failure")).toBe(true);
  expect((await queue.getForItem("retry-item"))[0]).toMatchObject({
    status: "pending",
    retryCount: 1,
  });
});

test("file capture persists its item and asset before queued processing becomes visible", async () => {
  const { root, library } = await temporaryLibrary();
  const item = await library.saveFile({
    fileName: "quick note.txt",
    mimeType: "text/plain",
    kind: "other",
    bytes: new TextEncoder().encode("captured immediately"),
  });
  if (!item) throw new Error("file was not saved");

  expect(item).toMatchObject({
    kind: "file",
    localAssetPath: `assets/items/${item.id}/quick note.txt`,
  });
  expect(readFileSync(join(root, "assets", "items", item.id, "quick note.txt"), "utf8")).toBe(
    "captured immediately",
  );
  expect(await library.jobs.getForItem(item.id)).toMatchObject([
    { kind: "generate_embedding", status: "pending" },
  ]);
  expect(await library.jobs.countActive()).toBe(1);
});

test("file bytes arrive as a typed array view or an ArrayBuffer, never a number array", async () => {
  const { root, library } = await temporaryLibrary();
  const text = new TextEncoder().encode("exact bytes");
  // A view into a larger buffer, as a pooled Buffer is: only its window is the file.
  const padded = new Uint8Array(text.length + 8);
  padded.set(text, 4);
  const saved = async (name: string, bytes: unknown) => {
    const item = await library.saveFile({
      fileName: name,
      mimeType: "text/plain",
      kind: "other",
      bytes,
    });
    if (!item) throw new Error("file was not saved");
    return item;
  };
  const read = (id: string, name: string) =>
    readFileSync(join(root, "assets", "items", id, name), "utf8");

  const view = await saved("view.txt", padded.subarray(4, 4 + text.length));
  const buffer = await saved("buffer.txt", text.buffer.slice(0));
  expect(read(view.id, "view.txt")).toBe("exact bytes");
  expect(read(buffer.id, "buffer.txt")).toBe("exact bytes");

  await expect(saved("array.txt", [...text])).rejects.toThrow(
    "must be a Uint8Array or ArrayBuffer",
  );
  await expect(saved("missing.txt", undefined)).rejects.toThrow("Uint8Array or ArrayBuffer");
  await expect(saved("empty.txt", new Uint8Array())).rejects.toThrow("cannot be empty");
});

test("image capture saves the item and header-read size without resizing", async () => {
  let resized = 0;
  const { root, library } = await temporaryLibrary({
    media: {
      inspectImage: async () => ({ width: 1200, height: 800 }),
      createThumbnail: async () => {
        resized += 1;
        return { bytes: Buffer.from("thumbnail"), width: 1200, height: 800 };
      },
    },
  });
  const item = await library.saveFile({
    fileName: "photo.png",
    mimeType: "image/png",
    bytes: new TextEncoder().encode("source image"),
  });
  if (!item) throw new Error("image was not saved");

  expect(resized).toBe(0);
  expect(item).toMatchObject({
    kind: "image",
    thumbnailPath: null,
    metadata: { mediaWidth: 1200, mediaHeight: 800 },
  });
  expect(readdirSync(join(root, "assets", "items", item.id))).toEqual(["photo.png"]);
  expect(
    library.db
      .prepare("SELECT kind, status FROM jobs WHERE item_id = ? ORDER BY kind")
      .all(item.id),
  ).toEqual([
    { kind: "generate_embedding", status: "pending" },
    { kind: IMAGE_THUMBNAIL_JOB, status: "pending" },
    { kind: "ocr_image", status: "pending" },
  ]);
  expect((await library.jobs.getForItem(item.id)).map((job) => job.kind)).not.toContain(
    IMAGE_THUMBNAIL_JOB,
  );
});

test("image capture refuses what inspection rejects before it stores anything", async () => {
  const { root, library } = await temporaryLibrary({
    media: {
      inspectImage: async () => {
        throw new Error("image processing error: image dimensions exceed safe limits");
      },
    },
  });
  await expect(
    library.saveFile({
      fileName: "huge.png",
      kind: "image",
      bytes: new TextEncoder().encode("not really"),
    }),
  ).rejects.toThrow("safe limits");

  expect(count(library, "items")).toBe(0);
  expect(count(library, "jobs")).toBe(0);
  expect(existsSync(join(root, "assets", "items"))).toBe(false);
});

test("image thumbnails publish once, record the decoded size, and tell the renderer", async () => {
  const events: string[] = [];
  const { root, library } = await temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
    media: {
      inspectImage: async () => null,
      createThumbnail: async () => ({ bytes: Buffer.from("thumbnail"), width: 640, height: 480 }),
    },
  });
  const source = Buffer.from("source image");
  const item = await library.saveFile({ fileName: "photo.bmp", kind: "image", bytes: source });
  const note = await library.createNote({ title: "Not an image", body: "text" });
  if (!item || !note) throw new Error("items were not saved");
  events.length = 0;

  expect(item.metadata.mediaWidth).toBeUndefined();
  expect(await library.storeImageThumbnail(note.id, source)).toBe(false);
  expect(await library.storeImageThumbnail("missing", source)).toBe(false);
  expect(await library.storeImageThumbnail(item.id, source)).toBe(true);
  expect(await library.storeImageThumbnail(item.id, source)).toBe(false);

  expect(events).toEqual([item.id]);
  expect(await library.getItem(item.id)).toMatchObject({
    thumbnailPath: `assets/items/${item.id}/thumbnail.webp`,
    metadata: { mediaWidth: 640, mediaHeight: 480, byteLength: source.length },
    updatedAt: item.updatedAt,
  });
  expect(readFileSync(join(root, "assets", "items", item.id, "thumbnail.webp"), "utf8")).toBe(
    "thumbnail",
  );
  expect(readdirSync(root).filter((name) => name.startsWith(".inkling-thumbnail-"))).toEqual([]);
});

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

test("successful export details persist across reopening the library", async () => {
  const { root, library } = await temporaryLibrary();
  await library.createNote({ title: "Exported note", body: "A small library copy." });
  const destination = join(root, "exports");
  mkdirSync(destination);

  const report = await library.exportLibrary(destination, 0);
  const lastExport = await library.getLastExport();
  expect(lastExport).toMatchObject({ exportedAt: expect.any(Number), items: report.items });
  await closeLibrary(library);

  const reopened = await trackedLibrary(join(root, "library.sqlite3"));
  expect(await reopened.getLastExport()).toEqual(lastExport);
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
  if (!note) throw new Error("note was not created");
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
  if (!item) throw new Error("note was not created");
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
  if (!item) throw new Error("file was not saved");
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

test("data directory keeps portable precedence and the product app-data identity", () => {
  expect(
    resolveLibraryDataDirectory({
      executablePath: "/apps/inkling/inkling.exe",
      appDataDirectory: "/users/test/AppData/Roaming",
      portable: true,
    }),
  ).toBe(join("/apps/inkling", "data"));
  expect(
    resolveLibraryDataDirectory({
      executablePath: "/apps/inkling/inkling.exe",
      appDataDirectory: "/users/test/AppData/Roaming",
    }),
  ).toBe(join("/users/test/AppData/Roaming", "com.inkling.library"));
  expect(
    resolveLibraryDataDirectory({
      executablePath: "/apps/inkling/inkling.exe",
      appDataDirectory: "/users/test/AppData/Roaming",
      overrideDirectory: "/scratch/library",
    }),
  ).toBe(resolve("/scratch/library"));
});

test("the worker leaves unregistered kinds queued instead of blocking capture", async () => {
  const { library } = await temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('pending-item', 'pdf', 1, 1)",
    )
    .run();
  await library.jobs.enqueue("pending-item", "ocr_pdf_page");
  const worker = await library.worker({ processors: {} });
  await worker.drain();
  expect((await library.jobs.getForItem("pending-item"))[0]?.status).toBe("pending");
  expect(await library.jobs.countActive()).toBe(1);
});

// regression: quitting mid-job used to leave the job in processing until its lease ran out.
test("stopping the worker hands its running job back without spending a retry", async () => {
  const { library } = await temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('first-item', 'note', 1, 1), ('next-item', 'note', 2, 2)",
    )
    .run();
  await library.jobs.enqueue("first-item", "blocked");
  await library.jobs.enqueue("next-item", "blocked");

  const started = Promise.withResolvers<void>();
  let processed = 0;
  const worker = await library.worker({
    processors: {
      blocked: () =>
        Effect.sync(() => {
          processed += 1;
          started.resolve();
        }).pipe(Effect.andThen(Effect.never)),
    },
  });
  const stop = worker.start();
  await started.promise;
  await stop();

  expect(processed).toBe(1);
  expect(
    library.db
      .prepare("SELECT item_id, status, retry_count, worker_id FROM jobs ORDER BY item_id")
      .all(),
  ).toEqual([
    { item_id: "first-item", status: "pending", retry_count: 0, worker_id: null },
    { item_id: "next-item", status: "pending", retry_count: 0, worker_id: null },
  ]);
});

// regression: a hung decoder or model call used to hold the worker forever.
test("a job that outlives its kind's timeout fails instead of holding the worker", async () => {
  const { library } = await temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('hung-item', 'note', 1, 1)",
    )
    .run();
  await library.jobs.enqueue("hung-item", "hung");
  const worker = await library.worker({
    processors: { hung: () => Effect.never },
    timeouts: { hung: Duration.millis(1) },
  });
  await worker.drain();

  expect((await library.jobs.getForItem("hung-item"))[0]).toMatchObject({
    status: "failed",
    retryCount: 3,
    errorMessage: expect.stringContaining("hung timed out"),
  });
});

test("a processor failure records the storage message, not the SQL client's summary", async () => {
  const { library } = await temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('broken-item', 'note', 1, 1)",
    )
    .run();
  await library.jobs.enqueue("broken-item", "broken");
  const worker = await library.worker({
    processors: { broken: () => storageFailure("item not found") },
  });
  await worker.drain();
  expect((await library.jobs.getForItem("broken-item"))[0]).toMatchObject({
    status: "failed",
    errorMessage: "item not found",
  });
});

test("a running worker wakes when its kind is queued instead of waiting for a poll", async () => {
  const { library } = await temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('wake-item', 'note', 1, 1)",
    )
    .run();
  const processed = Promise.withResolvers<string>();
  const worker = await library.worker({
    processors: { wake: (job) => Effect.sync(() => processed.resolve(job.itemId)) },
    pollInterval: Duration.hours(1),
  });
  const stop = worker.start();
  await library.jobs.enqueue("wake-item", "wake");
  expect(await processed.promise).toBe("wake-item");
  await stop();
});

test("silent thumbnail jobs never appear in summaries, counts, or lifecycle events", async () => {
  let now = 10_000;
  const events: string[] = [];
  const { library } = await temporaryLibrary({
    jobQueue: { now: () => now, onUpdated: (id) => events.push(id) },
  });
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('quiet-item', 'pdf', 1, 1)",
    )
    .run();
  const queue = library.jobs;

  const jobId = await queue.enqueue("quiet-item", PDF_THUMBNAIL_JOB);
  await queue.claimNext("worker-a");
  await queue.renew(jobId, "worker-a");
  await queue.updateProgress(jobId, "worker-a", 1, 2, "halfway");
  await queue.fail(jobId, "worker-a", "retrying");
  await queue.claimNext("worker-a");
  now += JOB_LEASE_MILLIS + 1;
  await queue.recoverExpired();
  await queue.claimNext("worker-b");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await queue.fail(jobId, "worker-b", "broken");
    await queue.claimNext("worker-b");
  }
  await queue.fail(jobId, "worker-b", "terminal");
  await queue.retry(jobId);
  await queue.claimNext("worker-b");
  await queue.release(jobId, "worker-b");
  await queue.claimNext("worker-b");
  await queue.complete(jobId, "worker-b");

  expect(events).toEqual([]);
  expect(await queue.getForItem("quiet-item")).toEqual([]);
  expect(await queue.getForItems(["quiet-item"])).toEqual([]);
  expect(await queue.countActive()).toBe(0);
  expect(library.db.prepare("SELECT status FROM jobs WHERE id = ?").get(jobId)).toEqual({
    status: "completed",
  });
});

test("the worker admits idle work only when nothing processable is pending and drains it without polling", async () => {
  const { library } = await temporaryLibrary();
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('a', 'note', 1, 1), ('b', 'note', 2, 2)",
    )
    .run();
  await library.jobs.enqueue("a", "queued");
  await library.jobs.enqueue("b", "unregistered");
  const order: string[] = [];
  let idleCalls = 0;
  const worker = await library.worker({
    processors: {
      queued: (job) => Effect.sync(() => order.push(`queued:${job.itemId}`)),
      idle: (job) => Effect.sync(() => order.push(`idle:${job.itemId}`)),
    },
    onIdle: () =>
      Effect.suspend(() => {
        idleCalls += 1;
        return idleCalls <= 2
          ? Effect.promise(() => library.jobs.enqueue("a", "idle"))
          : Effect.void;
      }),
  });
  await worker.drain();

  expect(order).toEqual(["queued:a", "idle:a", "idle:a"]);
  expect(idleCalls).toBe(3);
  expect((await library.jobs.getForItem("b"))[0]?.status).toBe("pending");
});

test("PDF thumbnails publish once, touch only thumbnail_path, and survive export and restore", async () => {
  let encoded = 0;
  const { root, library } = await temporaryLibrary({
    media: {
      createThumbnail: async () => {
        encoded += 1;
        return { bytes: Buffer.from("page one"), width: 396, height: 512 };
      },
    },
  });
  const pdf = await library.saveFile({
    fileName: "paper.pdf",
    mimeType: "application/pdf",
    bytes: new TextEncoder().encode("%PDF-1.4"),
  });
  const note = await library.createNote({ title: "Not a PDF", body: "text" });
  if (!pdf || !note) throw new Error("items were not saved");
  const before = await library.getItem(pdf.id);
  if (!before) throw new Error("PDF was not stored");
  const ftsBefore = ids(await library.searchItems("paper"));
  const writes = () => ({
    fts: library.db.prepare("SELECT * FROM items_fts WHERE item_id = ?").all(pdf.id),
    embeddings: library.db.prepare("SELECT * FROM item_embeddings").all(),
    jobs: library.db.prepare("SELECT id, kind, status FROM jobs ORDER BY id").all(),
  });
  const writesBefore = writes();

  expect(await library.storePdfThumbnail(note.id, Buffer.from("png"))).toBe(false);
  expect(await library.storePdfThumbnail("missing", Buffer.from("png"))).toBe(false);
  expect(await library.storePdfThumbnail(pdf.id, Buffer.from("png"))).toBe(true);
  expect(await library.storePdfThumbnail(pdf.id, Buffer.from("png"))).toBe(false);
  expect(encoded).toBe(1);

  expect(await library.getItem(pdf.id)).toEqual({
    ...before,
    thumbnailPath: `assets/items/${pdf.id}/thumbnail.webp`,
  });
  expect(ids(await library.searchItems("paper"))).toEqual(ftsBefore);
  expect(ftsBefore).toEqual([pdf.id]);
  expect(writes()).toEqual(writesBefore);
  expect(readdirSync(root).filter((name) => name.startsWith(".inkling-thumbnail-"))).toEqual([]);

  const destination = join(root, "exports");
  mkdirSync(destination);
  const report = await library.exportLibrary(destination, 0);
  const restored = await trackedLibrary(join(root, "restored", "library.sqlite3"));
  await restored.importLibrary(report.directory);
  expect((await restored.getItem(pdf.id))?.thumbnailPath).toBe(
    `assets/items/${pdf.id}/thumbnail.webp`,
  );
  expect(
    readFileSync(join(root, "restored", "assets", "items", pdf.id, "thumbnail.webp"), "utf8"),
  ).toBe("page one");
});

test("PDF thumbnail candidates walk the kind index by rowid without sorting and skip failed or assetless PDFs", async () => {
  const { library } = await temporaryLibrary();
  const insert = library.db.prepare(
    "INSERT INTO items (id, kind, local_asset_path, thumbnail_path, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)",
  );
  insert.run("done", "pdf", "assets/items/done/a.pdf", "assets/items/done/thumbnail.webp");
  insert.run("assetless", "pdf", null, null);
  insert.run("image", "image", "assets/items/image/a.png", null);
  insert.run("broken", "pdf", "assets/items/broken/a.pdf", null);
  insert.run("first", "pdf", "assets/items/first/a.pdf", null);
  insert.run("last", "pdf", "assets/items/last/a.pdf", null);
  const jobId = await library.jobs.enqueue("broken", PDF_THUMBNAIL_JOB);
  library.db.prepare("UPDATE jobs SET status = 'failed' WHERE id = ?").run(jobId);

  const first = await library.nextPdfThumbnailCandidate(0);
  expect(first?.id).toBe("first");
  const last = await library.nextPdfThumbnailCandidate(first?.rowid ?? 0);
  expect(last?.id).toBe("last");
  expect(await library.nextPdfThumbnailCandidate(last?.rowid ?? 0)).toBeUndefined();

  const plan = library.db
    .prepare(`EXPLAIN QUERY PLAN ${pdfThumbnailCandidateSql}`)
    .all(0, PDF_THUMBNAIL_JOB)
    .map((row) => String(row.detail));
  expect(
    plan.some((detail) => detail.includes("USING INDEX idx_items_kind (kind=? AND rowid>?)")),
  ).toBe(true);
  expect(plan.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
});

test("item job lookups return the latest job of each kind, for any number of items", async () => {
  let now = 1_000;
  const { library } = await temporaryLibrary({ jobQueue: { now: () => now } });
  library.db
    .prepare(
      "INSERT INTO items (id, kind, created_at, updated_at) VALUES ('ocr-item', 'image', 1, 1)",
    )
    .run();
  const queue = library.jobs;
  const first = await queue.enqueue("ocr-item", "ocr_image");
  await queue.claimNext("worker");
  await queue.complete(first, "worker");
  now += 1;
  const second = await queue.enqueue("ocr-item", "ocr_image");

  // More ids than SQLite allows as bound parameters.
  const itemIds = ["ocr-item", ...Array.from({ length: 40_000 }, (_, index) => `missing-${index}`)];
  expect((await queue.getForItems(itemIds)).map((job) => job.id)).toEqual([second]);
});

test("the change count holds still on reads and moves on every write", async () => {
  const { library } = await temporaryLibrary();
  const before = await library.changeCount();
  await library.listActiveItems();
  expect(await library.changeCount()).toBe(before);
  await library.createNote({ title: "Counted", body: "A write through the library." });
  expect(await library.changeCount()).toBeGreaterThan(before);
});
