import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  JOB_LEASE_MILLIS,
  PDF_THUMBNAIL_JOB,
  X_POST_MEDIA_JOB,
} from "../storage/jobs.ts";
import { closeLibrary } from "../storage/test-helpers.ts";
import {
  cleanUpJobTests,
  createJobs,
  imageFixture,
  jobFor,
  openLibrary,
  pdfFixture,
  saveImage,
  savePdf,
  temporaryLibrary,
  thumbnailLane,
} from "./test-jobs.ts";

cleanUpJobTests();

test("image capture stays instant and the thumbnail job publishes the card image", async () => {
  const events: string[] = [];
  const { root, library } = await temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
  });
  const image = await saveImage(library);
  const source = await sharp(imageFixture()).metadata();

  expect(image.thumbnailPath).toBeNull();
  expect(image.metadata).toMatchObject({ mediaWidth: source.width, mediaHeight: source.height });
  const itemDirectory = join(root, "assets", "items", image.id);
  expect(readdirSync(itemDirectory)).toEqual(["photo.png"]);
  events.length = 0;

  const jobs = await createJobs(root);
  await (await thumbnailLane(library, jobs, { workerId: "thumbnail-test" })).drain();

  expect((await library.getItem(image.id))?.thumbnailPath).toBe(
    `assets/items/${image.id}/thumbnail.webp`,
  );
  const thumbnail = await sharp(readFileSync(join(itemDirectory, "thumbnail.webp"))).metadata();
  expect(thumbnail).toMatchObject({ format: "webp" });
  expect(Math.max(thumbnail.width ?? 0, thumbnail.height ?? 0)).toBeLessThanOrEqual(512);
  // The renderer hears about it through the same event as every other item update.
  expect(events).toEqual([image.id]);
  expect((await library.jobs.getForItem(image.id)).map((job) => job.kind)).not.toContain(
    IMAGE_THUMBNAIL_JOB,
  );
});

test("the image palette job waits for the thumbnail job, then persists five dominant colors", async () => {
  const { root, library } = await temporaryLibrary();
  const image = await saveImage(library, "palette.png");
  const jobs = await createJobs(root);
  const paletteJobs = () =>
    library.db.prepare("SELECT status FROM jobs WHERE kind = ?").all(IMAGE_PALETTE_JOB);
  expect(paletteJobs()).toEqual([]);

  await (await thumbnailLane(library, jobs)).drain();
  expect(paletteJobs()).toEqual([{ status: "pending" }]);
  await library.run(jobs.processors[IMAGE_PALETTE_JOB](jobFor(image.id), "palette-test"));

  const palette = (await library.getItem(image.id))?.palette;
  expect(palette).toHaveLength(5);
  expect(palette?.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
});

test("a failed thumbnail keeps the item and the OCR and embedding work, with nothing to retry on screen", async () => {
  const { root, library } = await temporaryLibrary();
  const image = await saveImage(library, "corrupt.png");
  // The original goes bad after capture, so only the worker's decode can fail.
  writeFileSync(join(root, "assets", "items", image.id, "corrupt.png"), "not an image");
  const jobs = await createJobs(root);

  await (await thumbnailLane(library, jobs)).drain();
  await (await library.worker({ processors: jobs.processors, workerId: "main-lane" })).drain();

  expect(await library.getItem(image.id)).toMatchObject({
    id: image.id,
    kind: "image",
    thumbnailPath: null,
  });
  expect(
    library.db
      .prepare("SELECT status, retry_count FROM jobs WHERE kind = ?")
      .get(IMAGE_THUMBNAIL_JOB),
  ).toEqual({ status: "failed", retry_count: 0 });
  expect(
    library.db.prepare("SELECT 1 FROM jobs WHERE kind = ?").get(IMAGE_PALETTE_JOB),
  ).toBeUndefined();
  expect((await library.jobs.getForItem(image.id)).map((job) => job.status)).toEqual([
    "completed",
    "completed",
  ]);
  expect(await library.jobs.countActive()).toBe(0);
});

test("the thumbnail lane finishes while the main lane is held inside a long job", async () => {
  const { root, library } = await temporaryLibrary();
  const image = await saveImage(library);
  const started = Promise.withResolvers<void>();
  const ocrResult = Promise.withResolvers<string>();
  const jobs = await createJobs(root, {
    ocr: {
      recognize: () => {
        started.resolve();
        return ocrResult.promise;
      },
    },
  });
  const main = await library.worker({ processors: jobs.processors, workerId: "main-lane" });
  const mainRun = main.drain();
  await started.promise;

  await (await thumbnailLane(library, jobs)).drain();
  expect((await library.getItem(image.id))?.thumbnailPath).toBe(
    `assets/items/${image.id}/thumbnail.webp`,
  );

  ocrResult.resolve("");
  await mainRun;
});

test("a pending thumbnail job survives closing and reopening the library", async () => {
  const { root, library } = await temporaryLibrary();
  const image = await saveImage(library);
  await closeLibrary(library);

  const reopened = await openLibrary(join(root, "library.sqlite3"));
  expect((await reopened.getItem(image.id))?.thumbnailPath).toBeNull();
  const jobs = await createJobs(root);
  await (await thumbnailLane(reopened, jobs)).drain();

  expect((await reopened.getItem(image.id))?.thumbnailPath).toBe(
    `assets/items/${image.id}/thumbnail.webp`,
  );
});

test("a thumbnail job whose worker died resumes after its lease expires", async () => {
  let clock = 1_000_000;
  const { root, library } = await temporaryLibrary({ jobQueue: { now: () => clock } });
  const image = await saveImage(library);
  const job = library.db.prepare("SELECT id FROM jobs WHERE kind = ?").get(IMAGE_THUMBNAIL_JOB);
  expect((await library.jobs.claimNext("crashed-worker", [IMAGE_THUMBNAIL_JOB]))?.id).toBe(
    String(job?.id),
  );
  const jobs = await createJobs(root);
  const lane = await thumbnailLane(library, jobs);

  // Still leased: a restart inside the lease must not run it twice.
  await library.jobs.recoverExpired();
  await lane.drain();
  expect((await library.getItem(image.id))?.thumbnailPath).toBeNull();

  clock += JOB_LEASE_MILLIS + 1;
  await library.jobs.recoverExpired();
  await lane.drain();

  expect((await library.getItem(image.id))?.thumbnailPath).toBe(
    `assets/items/${image.id}/thumbnail.webp`,
  );
  expect(
    library.db.prepare("SELECT status FROM jobs WHERE kind = ?").all(IMAGE_THUMBNAIL_JOB),
  ).toEqual([{ status: "completed" }]);
});

test("a thumbnail job whose lease expired resumes on restart without duplicating work", async () => {
  let clock = 1_000_000;
  const events: string[] = [];
  const { root, library } = await temporaryLibrary({
    jobQueue: { now: () => clock, onUpdated: (id: string) => events.push(id) },
  });
  const pdf = await savePdf(library, "native.pdf", pdfFixture("pdf-native-text-01"));
  library.db.prepare("DELETE FROM jobs").run();
  const jobId = await library.jobs.enqueue(pdf.id, PDF_THUMBNAIL_JOB);
  expect((await library.jobs.claimNext("crashed-worker"))?.id).toBe(jobId);
  clock += JOB_LEASE_MILLIS + 1;
  events.length = 0;

  const jobs = await createJobs(root);
  const worker = await library.worker({
    processors: { [PDF_THUMBNAIL_JOB]: jobs.processors[PDF_THUMBNAIL_JOB] },
    onIdle: jobs.onIdle,
  });
  await library.jobs.recoverExpired();
  await worker.drain();

  expect((await library.getItem(pdf.id))?.thumbnailPath).toBe(
    `assets/items/${pdf.id}/thumbnail.webp`,
  );
  expect(library.db.prepare("SELECT id, status FROM jobs").all()).toEqual([
    { id: jobId, status: "completed" },
  ]);
  expect(events).toEqual([pdf.id]);
});

// An invented post, as the worker's extractor returns it.
const xPostUrl = "https://x.com/mara_okafor/status/301";
const pbs = (path: string) => `https://pbs.twimg.com/${path}?format=jpg&name=small`;
const xArticle = (sourceUrl: string) => ({
  sourceUrl,
  fetchedUrl: sourceUrl,
  canonicalUrl: xPostUrl,
  title: "Mara Okafor's post",
  description: "Tide tables, annotated",
  text: "Tide tables, annotated\n\nInes Lund @ines_lund Paper maps still win offline",
  html: "",
  author: "Mara Okafor",
  publishedDate: "2026-10-03T14:05:00.000Z",
  imageUrls: [],
  imageDimensions: [],
  safeEmbeds: [],
  extractor: "fallback" as const,
  social: {
    provider: "x" as const,
    postUrl: xPostUrl,
    postId: "301",
    authorName: "Mara Okafor",
    authorHandle: "mara_okafor",
    text: "Tide tables, annotated",
    avatarUrl: "https://pbs.twimg.com/profile_images/1/m_x96.jpg",
    media: [
      { kind: "photo" as const, url: pbs("media/Tide"), width: 1200, height: 800 },
      { kind: "photo" as const, url: pbs("media/Gone"), width: 1200, height: 800 },
    ],
    quote: {
      postId: "90",
      postUrl: "https://x.com/ines_lund/status/90",
      authorName: "Ines Lund",
      authorHandle: "ines_lund",
      text: "Paper maps still win offline",
      avatarUrl: "https://pbs.twimg.com/profile_images/2/i_normal.jpg",
    },
  },
});

test("a saved X post's pictures land in its own folder, and a network failure retries only what is missing", async () => {
  const { root, library } = await temporaryLibrary();
  const captured = await library.captureUrl({ sourceUrl: xPostUrl, captureSource: "quick link" });
  const requested: string[] = [];
  let avatarFailures = 1;
  const jobs = await createJobs(root, {
    extractUrl: async (sourceUrl) => xArticle(sourceUrl),
    downloadXMedia: async (url) => {
      requested.push(url);
      if (url.includes("Gone")) return null;
      if (url.includes("m_x96") && avatarFailures-- > 0) throw new Error("socket hang up");
      return imageFixture();
    },
  });
  await (await library.worker({ processors: jobs.processors })).drain();
  expect(
    library.db.prepare("SELECT status FROM jobs WHERE kind = ?").all(X_POST_MEDIA_JOB),
  ).toEqual([{ status: "pending" }]);

  await (await thumbnailLane(library, jobs)).drain();

  const folder = `assets/items/${captured.id}`;
  expect(readdirSync(join(root, folder)).sort()).toEqual([
    "x-avatar.png",
    "x-media-0.png",
    "x-quote-avatar.png",
  ]);
  const social = (await library.getItem(captured.id))?.metadata.social;
  expect(social).toMatchObject({
    avatarPath: `${folder}/x-avatar.png`,
    media: [{ path: `${folder}/x-media-0.png` }, { url: pbs("media/Gone") }],
    quote: { avatarPath: `${folder}/x-quote-avatar.png` },
  });
  expect(social).not.toHaveProperty("media.1.path");
  // The first run stored two pictures and failed on the avatar; the retry asked again only
  // for the avatar and the picture that answered without an image.
  expect(requested.filter((url) => url.includes("Tide"))).toHaveLength(1);
  expect(requested.filter((url) => url.includes("m_x96"))).toHaveLength(2);
  expect(
    library.db.prepare("SELECT status FROM jobs WHERE kind = ?").all(X_POST_MEDIA_JOB),
  ).toEqual([{ status: "completed" }]);
  // Search reaches the quoted post through the enriched text.
  const cards = await library.searchItems("paper maps", 20);
  expect(cards.map((item) => item.id)).toEqual([captured.id]);
  // The card draws the library's copies only; a picture still missing is left off it.
  expect(cards[0].metadata.social).toEqual({
    provider: "x",
    postUrl: xPostUrl,
    postId: "301",
    authorName: "Mara Okafor",
    authorHandle: "mara_okafor",
    avatarPath: `${folder}/x-avatar.png`,
    text: "Tide tables, annotated",
    media: [{ kind: "photo", width: 1200, height: 800, path: `${folder}/x-media-0.png` }],
    quote: {
      postId: "90",
      postUrl: "https://x.com/ines_lund/status/90",
      authorName: "Ines Lund",
      authorHandle: "ines_lund",
      avatarPath: `${folder}/x-quote-avatar.png`,
      text: "Paper maps still win offline",
    },
  });
});

test("post pictures are refused for an unsafe item id or a deleted item", async () => {
  const { root, library } = await temporaryLibrary();
  const bytes = imageFixture();
  const file = { slot: "avatar", url: "https://pbs.twimg.com/a.jpg", bytes };
  await expect(library.storeXPostMedia("../escape", [file])).rejects.toThrow("escaped");
  expect(await library.storeXPostMedia("missing-item", [file])).toBe(false);
  expect(existsSync(join(root, "assets", "items"))).toBe(false);
});
