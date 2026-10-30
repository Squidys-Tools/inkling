import { afterAll, afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pdfThumbnailCandidateSql } from "./enrichment.ts";
import { PDF_THUMBNAIL_JOB } from "./jobs.ts";
import {
  closeAll,
  ids,
  removeTemporaryRoots,
  temporaryLibrary,
  trackedLibrary,
} from "./test-helpers.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("URL enrichment preserves a title and tags edited while extraction is queued", async () => {
  const { library } = await temporaryLibrary();
  const item = await library.captureUrl({
    sourceUrl: "https://example.com/article",
    title: "Extension title",
    captureSource: "browser extension",
  });
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
