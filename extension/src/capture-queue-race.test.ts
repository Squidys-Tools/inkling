// Regression test: saveTab drains the queue in the background while it may also
// enqueue the capture it just failed to deliver. Both paths do a
// read-modify-write on storage, so they must not interleave — otherwise the
// flush's stale write silently drops the capture it reported as queued.
import { expect, test } from "bun:test";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

const QUEUE_KEY = "inkling:pending-captures-v1";

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

test("a capture enqueued during a queue flush survives the flush write", async () => {
  const storage: Record<string, unknown> = {
    [QUEUE_KEY]: [payload(1)],
    "inkling.base-url": "http://127.0.0.1:1234",
    "inkling.token": "test-token",
  };
  const fresh = payload(2);
  let releaseQueuedPost: () => void = () => {};
  const queuedPostBlocked = new Promise<void>((resolve) => {
    releaseQueuedPost = resolve;
  });

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      id: "inkling-test",
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} },
    },
    contextMenus: { onClicked: { addListener: () => {} } },
    commands: { onCommand: { addListener: () => {} } },
    scripting: { executeScript: async () => [{ result: fresh }] },
    storage: {
      local: {
        get: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => {
          const wanted = typeof keys === "string" ? [keys] : keys;
          const found: Record<string, unknown> = {};
          for (const key of wanted) {
            if (key in storage) found[key] = storage[key];
          }
          callback(found);
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(storage, items);
          callback?.();
        },
      },
    },
  };

  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    if (init?.body?.includes("/1")) {
      await queuedPostBlocked;
      return { ok: true, status: 200 };
    }
    throw new Error("receiver offline");
  }) as typeof fetch;

  const { flushQueue, saveTab } = await import("./background");
  const flushed = flushQueue();
  // Let the flush read the queue and block on its in-flight POST.
  await Promise.resolve();
  const saved = saveTab(1);
  // Give an unserialized enqueue time to do its read-modify-write while the
  // flush is still holding the queue. With the lock, nothing may be written.
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(storage[QUEUE_KEY]).toEqual([payload(1)]);
  releaseQueuedPost();

  const [flushResult, saveStatus] = await Promise.all([flushed, saved]);
  expect(flushResult.delivered).toBe(1);
  expect(saveStatus.state).toBe("queued");
  // The flush emptied the queue; the new capture must still be there.
  expect(storage[QUEUE_KEY]).toEqual([fresh]);
});
