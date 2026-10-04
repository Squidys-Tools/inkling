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
/**
 * A fake write failure: the message the browser would use, and how many writes
 * it fails. Infinity for a failure that persists, 1 for "the first write lost a
 * race, the retry is fine".
 */
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

const { QUEUE_KEY, enqueue, readQueue, withQueueLock } = await import("./capture-queue-store");
const { removeSettledCaptureEntries } = await import("./capture-queue");

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

test("a full storage quota reports nothing kept rather than a phantom entry", async () => {
  // Every older entry is dropped one at a time until the write fits. When even
  // the newest one will not fit, the capture is gone, and saying "1 pending"
  // would tell the user it is safe when it is not.
  storage[QUEUE_KEY] = [payload(1)];
  writeFailure = { message: "QUOTA_BYTES quota exceeded", writes: Infinity };

  expect(await enqueue(payload(2))).toBe(0);
  // The entry storage already holds is untouched; nothing claimed to add to it.
  expect(storage[QUEUE_KEY]).toEqual([payload(1)]);
});

test("a full storage quota drops the oldest capture to make room", async () => {
  // Quota is the one failure eviction answers: dropping an older capture is a
  // real trade, taken because the alternative is storing nothing. Only the first
  // write fails, so the retry after eviction has to succeed.
  storage[QUEUE_KEY] = [payload(1), payload(2)];
  writeFailure = { message: "QUOTA_BYTES quota exceeded", writes: 1 };

  expect(await enqueue(payload(3))).toBe(2);
  // The oldest went to make room for the capture being saved.
  expect(storage[QUEUE_KEY]).toEqual([payload(2), payload(3)]);
});

test("a transient storage failure keeps the backlog instead of evicting it", async () => {
  // A locked profile or a momentary I/O error says nothing about space. Treating
  // it as quota silently destroyed older captures to make room for a capture
  // that was never stored — losing the offline backlog, which is the one thing
  // the queue exists to protect.
  const transient = "An unexpected error occurred while setting the storage item";
  storage[QUEUE_KEY] = [payload(1), payload(2)];
  writeFailure = { message: transient, writes: Infinity };

  await expect(enqueue(payload(3))).rejects.toThrow(transient);
  expect(storage[QUEUE_KEY]).toEqual([payload(1), payload(2)]);
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

test("an enqueue is not blocked by a flush that is still delivering", async () => {
  // The flush delivers over the network outside the lock. An enqueue that waits
  // for that delivery is a capture the user watched hang and then lost when the
  // browser killed the worker mid-flush.
  const batched = payload(1);
  const fresh = payload(2);
  storage[QUEUE_KEY] = [batched];

  let releaseDelivery: () => void = () => {};
  const delivering = new Promise<void>((resolve) => {
    releaseDelivery = resolve;
  });

  // Stands in for flushQueue: read the batch under the lock, deliver with the
  // lock released, then settle the batch under it again.
  const flushed = (async () => {
    const batch = await withQueueLock(readQueue);
    await delivering;
    return withQueueLock(async () => {
      const queue = await readQueue();
      removeSettledCaptureEntries(queue, batch);
      await localSet({ [QUEUE_KEY]: queue });
      return queue.length;
    });
  })();

  await Promise.resolve();

  // The flush holds no lock, so this completes while delivery is still blocked.
  expect(await enqueue(fresh)).toBe(2);

  releaseDelivery();
  expect(await flushed).toBe(1);
  expect(storage[QUEUE_KEY]).toEqual([fresh]);
});
