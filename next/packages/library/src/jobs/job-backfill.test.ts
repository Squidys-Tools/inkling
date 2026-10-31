import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { extractPdfTextByPages } from "@inkling/jobs/pdf";
import { JobQueue, Library, PDF_THUMBNAIL_JOB } from "../storage/library.ts";
import { cleanUpJobTests, createJobs, pdfFixture, savePdf, temporaryLibrary } from "./test-jobs.ts";

cleanUpJobTests();

test("backfill drains one missing PDF thumbnail at a time, hides the work, and skips a broken PDF", async () => {
  const events: string[] = [];
  const { root, library } = await temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
  });
  const first = await savePdf(library, "native.pdf", pdfFixture("pdf-native-text-01"));
  const broken = await savePdf(library, "broken.pdf", Buffer.from("not a pdf"));
  const second = await savePdf(library, "tables.pdf", pdfFixture("pdf-tables-01"));
  library.db.prepare("DELETE FROM jobs").run();
  events.length = 0;
  const captured = [await library.getItem(first.id), await library.getItem(second.id)];

  const ai = await createJobs(root);
  const outstanding = () =>
    library.db
      .prepare(
        "SELECT COUNT(*) AS count FROM jobs WHERE kind = ? AND status IN ('pending', 'processing')",
      )
      .get(PDF_THUMBNAIL_JOB)?.count;
  const observed: unknown[] = [];
  const idleOutstanding: unknown[] = [];
  const hidden: boolean[] = [];
  const worker = await library.worker({
    processors: {
      [PDF_THUMBNAIL_JOB]: (job, workerId) =>
        Effect.gen(function* () {
          const jobs = yield* JobQueue;
          observed.push(outstanding());
          hidden.push(
            (yield* jobs.countActive()) === 0 &&
              (yield* jobs.getForItems([first.id, broken.id, second.id])).length === 0,
          );
          yield* ai.processors[PDF_THUMBNAIL_JOB](job, workerId);
        }),
    },
    onIdle: () =>
      ai.onIdle().pipe(Effect.tap(() => Effect.sync(() => idleOutstanding.push(outstanding())))),
  });
  await worker.drain();

  expect(observed).toEqual([1, 1, 1, 1, 1, 1]);
  expect(idleOutstanding.every((count) => Number(count) <= 1)).toBe(true);
  expect(hidden.every(Boolean)).toBe(true);
  expect((await library.getItem(first.id))?.thumbnailPath).toBe(
    `assets/items/${first.id}/thumbnail.webp`,
  );
  expect((await library.getItem(second.id))?.thumbnailPath).toBe(
    `assets/items/${second.id}/thumbnail.webp`,
  );
  expect((await library.getItem(broken.id))?.thumbnailPath).toBeNull();
  expect(
    library.db.prepare("SELECT status, retry_count FROM jobs WHERE item_id = ?").get(broken.id),
  ).toEqual({ status: "failed", retry_count: 3 });
  expect(events.sort()).toEqual([first.id, second.id].sort());
  for (const item of captured)
    expect(await library.getItem(item?.id ?? "")).toEqual({
      ...item,
      thumbnailPath: `assets/items/${item?.id}/thumbnail.webp`,
    } as typeof item);
  expect(await library.jobs.getForItem(broken.id)).toEqual([]);

  const jobRows = () => library.db.prepare("SELECT COUNT(*) AS count FROM jobs").get()?.count;
  const before = jobRows();
  await worker.drain();
  await library.run(ai.onIdle());
  expect(jobRows()).toBe(before);
  expect(existsSync(join(root, "assets", "items", broken.id, "thumbnail.webp"))).toBe(false);
});

test("backfill stops scanning once exhausted and resumes only when PDF OCR leaves a page without a thumbnail", async () => {
  const { root, library } = await temporaryLibrary();
  let renderDuringOcr = true;
  const ai = await createJobs(root, {
    extractPdf: (bytes, options) =>
      extractPdfTextByPages(
        bytes,
        renderDuringOcr ? options : { ...options, onFirstPageThumbnail: undefined },
      ),
  });
  let scans = 0;
  const real = library.services.library;
  const counted = {
    ...real,
    nextPdfThumbnailCandidate: (cursor: number) => {
      scans += 1;
      return real.nextPdfThumbnailCandidate(cursor);
    },
  };
  const worker = await library.worker({
    processors: ai.processors,
    onIdle: () => ai.onIdle().pipe(Effect.provideService(Library, counted)),
  });
  const jobKinds = (id: string) =>
    library.db
      .prepare("SELECT kind FROM jobs WHERE item_id = ? ORDER BY kind")
      .all(id)
      .map((row) => row.kind);

  const legacy = await savePdf(library, "legacy.pdf", pdfFixture("pdf-native-text-01"));
  library.db.prepare("DELETE FROM jobs").run();
  await worker.drain();
  expect((await library.getItem(legacy.id))?.thumbnailPath).not.toBeNull();
  const exhaustedScans = scans;
  await worker.drain();
  await worker.drain();
  expect(scans).toBe(exhaustedScans);

  const captured = await savePdf(library, "tables.pdf", pdfFixture("pdf-tables-01"));
  await worker.drain();
  expect((await library.getItem(captured.id))?.thumbnailPath).not.toBeNull();
  expect(jobKinds(captured.id)).not.toContain(PDF_THUMBNAIL_JOB);
  expect(scans).toBe(exhaustedScans);

  renderDuringOcr = false;
  const unrendered = await savePdf(library, "columns.pdf", pdfFixture("pdf-multicolumn-01"));
  await worker.drain();
  expect(scans).toBeGreaterThan(exhaustedScans);
  expect(jobKinds(unrendered.id)).toContain(PDF_THUMBNAIL_JOB);
  expect((await library.getItem(unrendered.id))?.thumbnailPath).toBe(
    `assets/items/${unrendered.id}/thumbnail.webp`,
  );
});

test("backfill retries the same candidate after queue admission fails", async () => {
  const { root, library } = await temporaryLibrary();
  const pdf = await savePdf(library, "native.pdf", pdfFixture("pdf-native-text-01"));
  library.db.prepare("DELETE FROM jobs").run();

  const ai = await createJobs(root);
  const real = library.services.jobs;
  let failAdmission = true;
  const flaky = {
    ...real,
    enqueue: (itemId: string, kind: string) => {
      if (!failAdmission) return real.enqueue(itemId, kind);
      failAdmission = false;
      return Effect.fail(new Error("temporary queue failure"));
    },
  };
  const idle = () => library.run(ai.onIdle().pipe(Effect.provideService(JobQueue, flaky)));

  await expect(idle()).rejects.toThrow("temporary queue failure");
  await idle();

  expect(
    library.db.prepare("SELECT item_id, kind, status FROM jobs WHERE item_id = ?").get(pdf.id),
  ).toEqual({
    item_id: pdf.id,
    kind: PDF_THUMBNAIL_JOB,
    status: "pending",
  });
});
