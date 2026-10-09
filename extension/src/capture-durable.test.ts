import { afterEach, expect, mock, test } from "bun:test";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

// The durable-delivery contract: a capture is written to the queue BEFORE the
// delivery attempt, so a worker torn down mid-save leaves it recoverable. The
// queue store is exercised directly rather than through the service worker,
// because standing up `background.ts` means its whole chrome surface, and the
// property under test is about ordering the store and the network call, not
// about the worker.

const storage: Record<string, unknown> = {};
let writeFailure: { message: string; writes: number } | null = null;

const localGet = async (keys: string | string[]) => {
  const wanted = typeof keys === "string" ? [keys] : keys;
  const found: Record<string, unknown> = {};
  for (const key of wanted) {
    if (key in storage) found[key] = storage[key];
  }
  return found;
};
const localSet = async (items: Record<string, unknown>) => {
  if (writeFailure && writeFailure.writes > 0) {
    writeFailure.writes -= 1;
    throw new Error(writeFailure.message);
  }
  Object.assign(storage, items);
};

mock.module("webextension-polyfill", () => ({
  default: { storage: { local: { get: localGet, set: localSet } } },
}));

const { enqueue, readQueue, settle } = await import("./capture-queue-store");

function payload(id: number): PageCapturePayloadV1 {
  return {
    version: 1,
    kind: "page",
    url: `https://example.com/${id}`,
    title: `Item ${id}`,
    defuddledHtml: "<p>body</p>",
    text: "body",
    imageUrls: [],
  };
}

afterEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  writeFailure = null;
});

test("a capture written before delivery survives the worker dying mid-save", async () => {
  const capture = payload(1);
  // The durable record exists before any network call. If the worker is torn
  // down here, this is what the next flush finds.
  await enqueue(capture);
  expect(await readQueue()).toEqual([capture]);

  // Nothing settled it, because the attempt never completed.
  expect(await readQueue()).toHaveLength(1);
});

test("a delivered capture settles and leaves the queue", async () => {
  const capture = payload(2);
  await enqueue(capture);
  expect(await settle(capture)).toBe(true);
  expect(await readQueue()).toEqual([]);
});

test("a permanently rejected capture does not stay queued", async () => {
  const capture = payload(3);
  await enqueue(capture);
  // A rejection on its merits settles the entry for the same reason a delivery
  // does: a retry would only be refused identically.
  await settle(capture);
  expect(await readQueue()).toEqual([]);
});

test("settling one of two identical captures leaves its twin", async () => {
  const capture = payload(4);
  await enqueue(capture);
  await enqueue(capture);
  expect(await readQueue()).toHaveLength(2);

  expect(await settle(capture)).toBe(true);
  expect(
    await readQueue(),
    "settling one delivery must not consume the twin's entry",
  ).toHaveLength(1);
});

test("settling a capture that is not queued is not an error", async () => {
  expect(await settle(payload(5))).toBe(false);
});

test("a capture appended during delivery survives the settle", async () => {
  const mine = payload(6);
  const later = payload(7);
  await enqueue(mine);
  // Arrives while the attempt for `mine` is still in flight.
  await enqueue(later);

  expect(await settle(mine)).toBe(true);
  expect(await readQueue(), "the concurrently appended capture must survive").toEqual([
    later,
  ]);
});

test("a full queue drops the oldest capture to make room for the newest", async () => {
  const older = payload(8);
  await enqueue(older);
  // The write fails once with a real quota error, so the store has to evict.
  writeFailure = { message: "QUOTA_BYTES quota exceeded", writes: 1 };
  const newest = payload(9);
  const pending = await enqueue(newest);
  writeFailure = null;

  // Eviction is oldest-first and always keeps the newest: the capture the user
  // just made is the one that must survive, since it is the one still in hand.
  expect(pending).toBe(1);
  expect(await readQueue()).toEqual([newest]);
  expect(await readQueue()).not.toContain(older);
});

test("a capture storage will not take at all reports zero rather than a phantom entry", async () => {
  // Nothing older is left to evict, so the store cannot make room. Reporting a
  // nonzero count here is what let a transient delivery failure announce
  // `state: "queued"` for a payload no flush will ever find again.
  writeFailure = { message: "QUOTA_BYTES quota exceeded", writes: 1 };
  const pending = await enqueue(payload(10));
  writeFailure = null;

  expect(pending).toBe(0);
  expect(await readQueue()).toEqual([]);
});