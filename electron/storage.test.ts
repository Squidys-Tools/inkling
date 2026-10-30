import { afterAll, afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TEXT_MODEL } from "./embedding-contract.ts";
import { pdfThumbnailCandidateSql } from "./storage/enrichment.ts";
import { IMAGE_THUMBNAIL_JOB, PDF_THUMBNAIL_JOB, URL_ENRICHMENT_JOB } from "./storage/library.ts";
import {
  closeAll,
  closeDatabase,
  closeLibrary,
  count,
  ids,
  removeTemporaryRoots,
  seedFromDemo,
  temporaryLibrary,
  trackDatabase,
  trackedLibrary,
  vector,
} from "./storage/test-helpers.ts";
import type { TestLibrary } from "./storage/test-library.ts";

async function enrichUrl(library: TestLibrary, itemId: string, article: object) {
  const workerId = `url-test-${randomUUID()}`;
  const job = await library.jobs.claimNext(workerId);
  if (!job) throw new Error("URL enrichment job was not available");
  expect(job).toMatchObject({ itemId, kind: URL_ENRICHMENT_JOB, status: "processing" });
  expect(await library.applyUrlEnrichment(job.id, workerId, article)).toBe(true);
  expect(await library.jobs.complete(job.id, workerId)).toBe(true);
}

afterEach(closeAll);
afterAll(removeTemporaryRoots);

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
