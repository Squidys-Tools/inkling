import { afterAll, afterEach, expect, test } from "bun:test";
import { Duration, Effect } from "effect";
import { storageFailure } from "./errors.ts";
import { closeAll, removeTemporaryRoots, temporaryLibrary } from "./test-helpers.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

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
