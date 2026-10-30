import { afterAll, afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { TEXT_MODEL } from "../embedding-contract.ts";
import { URL_ENRICHMENT_JOB } from "./jobs.ts";
import {
  closeAll,
  count,
  ids,
  removeTemporaryRoots,
  temporaryLibrary,
  trackedLibrary,
  vector,
} from "./test-helpers.ts";
import type { TestLibrary } from "./test-library.ts";

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
