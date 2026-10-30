import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  JOB_LEASE_MILLIS,
  PDF_THUMBNAIL_JOB,
} from "./storage/library.ts";
import { closeLibrary } from "./storage/test-helpers.ts";
import {
  cleanUpJobTests,
  closeProcessors,
  createAiJobProcessors,
  imageFixture,
  jobFor,
  openLibrary,
  pdfFixture,
  saveImage,
  savePdf,
  temporaryLibrary,
  thumbnailLane,
  unusedModels,
} from "./test-jobs.ts";
import { createImageThumbnail } from "./thumbnail.ts";

cleanUpJobTests();

test("image capture stays instant and the thumbnail job publishes the card image", async () => {
  const events: string[] = [];
  let thumbnailCalls = 0;
  const { root, library } = await temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
    media: {
      createThumbnail: async (bytes) => {
        thumbnailCalls += 1;
        return createImageThumbnail(bytes);
      },
    },
  });
  const image = await saveImage(library);
  const source = await sharp(imageFixture()).metadata();

  expect(thumbnailCalls).toBe(0);
  expect(image.thumbnailPath).toBeNull();
  expect(image.metadata).toMatchObject({ mediaWidth: source.width, mediaHeight: source.height });
  const itemDirectory = join(root, "assets", "items", image.id);
  expect(readdirSync(itemDirectory)).toEqual(["photo.png"]);
  events.length = 0;

  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  await (await thumbnailLane(library, ai, { workerId: "thumbnail-test" })).drain();

  expect(thumbnailCalls).toBe(1);
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
  await closeProcessors(ai);
});

test("the image palette job waits for the thumbnail job, then persists five dominant colors", async () => {
  const { root, library } = await temporaryLibrary();
  const image = await saveImage(library, "palette.png");
  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  const paletteJobs = () =>
    library.db.prepare("SELECT status FROM jobs WHERE kind = ?").all(IMAGE_PALETTE_JOB);
  expect(paletteJobs()).toEqual([]);

  await (await thumbnailLane(library, ai)).drain();
  expect(paletteJobs()).toEqual([{ status: "pending" }]);
  await library.run(ai.processors[IMAGE_PALETTE_JOB](jobFor(image.id), "palette-test"));

  const palette = (await library.getItem(image.id))?.palette;
  expect(palette).toHaveLength(5);
  expect(palette?.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
  await closeProcessors(ai);
});

test("a failed thumbnail keeps the item and the OCR and embedding work, with nothing to retry on screen", async () => {
  const { root, library } = await temporaryLibrary({
    media: {
      createThumbnail: async () => {
        throw new Error("image processing error: unable to decode image");
      },
    },
  });
  const image = await saveImage(library, "corrupt.png");
  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });

  await (await thumbnailLane(library, ai)).drain();
  await (await library.worker({ processors: ai.processors, workerId: "main-lane" })).drain();

  expect(await library.getItem(image.id)).toMatchObject({
    id: image.id,
    kind: "image",
    thumbnailPath: null,
  });
  expect(
    library.db
      .prepare("SELECT status, retry_count FROM jobs WHERE kind = ?")
      .get(IMAGE_THUMBNAIL_JOB),
  ).toEqual({ status: "failed", retry_count: 3 });
  expect(
    library.db.prepare("SELECT 1 FROM jobs WHERE kind = ?").get(IMAGE_PALETTE_JOB),
  ).toBeUndefined();
  expect((await library.jobs.getForItem(image.id)).map((job) => job.status)).toEqual([
    "completed",
    "completed",
  ]);
  expect(await library.jobs.countActive()).toBe(0);
  await closeProcessors(ai);
});

test("the thumbnail lane finishes while the main worker is held inside a long job", async () => {
  const { root, library } = await temporaryLibrary();
  const image = await saveImage(library);
  const started = Promise.withResolvers<void>();
  const ocrResult = Promise.withResolvers<string>();
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ...unusedModels,
    ocr: {
      recognize: () => {
        started.resolve();
        return ocrResult.promise;
      },
    },
  });
  const main = await library.worker({ processors: ai.processors, workerId: "main-lane" });
  const mainRun = main.drain();
  await started.promise;

  await (await thumbnailLane(library, ai)).drain();
  expect((await library.getItem(image.id))?.thumbnailPath).toBe(
    `assets/items/${image.id}/thumbnail.webp`,
  );

  ocrResult.resolve("");
  await mainRun;
  await closeProcessors(ai);
});

test("a pending thumbnail job survives closing and reopening the library", async () => {
  const { root, library } = await temporaryLibrary();
  const image = await saveImage(library);
  await closeLibrary(library);

  const reopened = await openLibrary(join(root, "library.sqlite3"));
  expect((await reopened.getItem(image.id))?.thumbnailPath).toBeNull();
  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  await (await thumbnailLane(reopened, ai)).drain();

  expect((await reopened.getItem(image.id))?.thumbnailPath).toBe(
    `assets/items/${image.id}/thumbnail.webp`,
  );
  await closeProcessors(ai);
});

test("a thumbnail job whose worker died resumes after its lease expires", async () => {
  let clock = 1_000_000;
  const { root, library } = await temporaryLibrary({ jobQueue: { now: () => clock } });
  const image = await saveImage(library);
  const job = library.db.prepare("SELECT id FROM jobs WHERE kind = ?").get(IMAGE_THUMBNAIL_JOB);
  expect((await library.jobs.claimNext("crashed-worker", [IMAGE_THUMBNAIL_JOB]))?.id).toBe(
    String(job?.id),
  );
  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  const lane = await thumbnailLane(library, ai);

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
  await closeProcessors(ai);
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

  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  const worker = await library.worker({
    processors: { [PDF_THUMBNAIL_JOB]: ai.processors[PDF_THUMBNAIL_JOB] },
    onIdle: ai.onIdle,
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
  await closeProcessors(ai);
});
