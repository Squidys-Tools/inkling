import { expect, test } from "bun:test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  JOB_LEASE_MILLIS,
  PDF_THUMBNAIL_JOB,
} from "../storage/library.ts";
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
  ).toEqual({ status: "failed", retry_count: 3 });
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
