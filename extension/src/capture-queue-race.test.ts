// Regression test: a flush of the pending-capture queue can take seconds, and a
// capture enqueued while it runs must survive. Both do a read-modify-write on
// storage, so without serialization the flush's stale write drops the capture
// it reported as queued.
//
// This drives the queue module directly instead of the whole service worker:
// two test files that both import ./background and stub the chrome global
// interfere with each other depending on which file bun runs first, which made
// this fail on CI while passing locally.
import { afterEach, expect, mock, test } from "bun:test";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

const storage: Record<string, unknown> = {};

const localGet = async (keys: string | string[]) => {
  const wanted = typeof keys === "string" ? [keys] : keys;
  const found: Record<string, unknown> = {};
  for (const key of wanted) {
    if (key in storage) found[key] = storage[key];
  }
  return found;
};
const localSet = async (items: Record<string, unknown>) => {
  Object.assign(storage, items);
};

mock.module("webextension-polyfill", () => ({
  default: { storage: { local: { get: localGet, set: localSet } } },
}));

const { QUEUE_KEY, enqueue, readQueue, withQueueLock } = await import("./capture-queue-store");

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
});

test("a capture enqueued during a queue flush survives the flush write", async () => {
  const first = payload(1);
  const fresh = payload(2);
  storage[QUEUE_KEY] = [first];

  let releaseFlush: () => void = () => {};
  const flushBlocked = new Promise<void>((resolve) => {
    releaseFlush = resolve;
  });

  // Stands in for flushQueue: read the queue, take a long time delivering, then
  // write back only what it managed to deliver.
  const flushed = withQueueLock(async () => {
    const queue = await readQueue();
    await flushBlocked;
    await localSet({ [QUEUE_KEY]: [] });
    return { delivered: queue.length, pending: 0 };
  });

  // Let the flush reach its blocked delivery before the enqueue lands.
  await Promise.resolve();
  await Promise.resolve();

  const saved = enqueue(fresh);
  // With the lock held, nothing may be written while the flush is in flight.
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(storage[QUEUE_KEY]).toEqual([first]);

  releaseFlush();
  const [flushResult, queued] = await Promise.all([flushed, saved]);

  expect(flushResult.delivered).toBe(1);
  // The flush emptied the queue; the capture enqueued behind it must remain.
  expect(storage[QUEUE_KEY]).toEqual([fresh]);
  expect(queued).toBe(1);
});
