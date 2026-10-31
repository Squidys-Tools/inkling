import { afterAll, afterEach, expect, test } from "bun:test";
import { JOB_LEASE_MILLIS, PDF_THUMBNAIL_JOB } from "./jobs.ts";
import { closeAll, removeTemporaryRoots, temporaryLibrary } from "./test-helpers.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

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

test("parallel lanes run each item's own jobs one at a time, in the order queued", async () => {
  let now = 1;
  const { library } = await temporaryLibrary({ jobQueue: { now: () => now++ } });
  const insert = library.db.prepare(
    `INSERT INTO items (id, kind, created_at, updated_at) VALUES (?, 'image', 1, 1)`,
  );
  for (const id of ["first", "second"]) insert.run(id);
  const queue = library.jobs;
  const main = ["ocr_image", "generate_embedding"];
  const ocr = await queue.enqueue("first", "ocr_image");
  const embedding = await queue.enqueue("first", "generate_embedding");
  await queue.enqueue("first", "image_thumbnail");
  const otherOcr = await queue.enqueue("second", "ocr_image");

  expect((await queue.claimNext("lane-a", main))?.id).toBe(ocr);
  // The first item's embedding waits for its OCR; another lane takes the next item.
  expect((await queue.claimNext("lane-b", main))?.id).toBe(otherOcr);
  expect(await queue.claimNext("lane-c", main)).toBeNull();
  // Other lanes' kinds are not held back by a main-lane job on the same item.
  expect((await queue.claimNext("thumbnails", ["image_thumbnail"]))?.kind).toBe("image_thumbnail");
  // OCR finding text queues no duplicate: the pending embedding runs next, after it.
  expect(await queue.enqueue("first", "generate_embedding")).toBe(embedding);
  expect(await queue.complete(ocr, "lane-a")).toBe(true);
  expect((await queue.claimNext("lane-c", main))?.kind).toBe("generate_embedding");
});
