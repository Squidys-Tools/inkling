// Pending-capture queue: the read-modify-write and its serialization, kept
// apart from the service worker so the race can be tested without standing up
// the whole background module (and its chrome global) around it.
import browser from "webextension-polyfill";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";
import type { ExtensionCapturePayload } from "./payload";
import { isQueuedCapturePayload } from "./queue-payload";
import { trimCaptureQueue } from "./capture-queue";

export type QueuedCapturePayload = PageCapturePayloadV1 | ExtensionCapturePayload;

export const QUEUE_KEY = "inkling:pending-captures-v1";

export async function readQueue(): Promise<QueuedCapturePayload[]> {
  const stored = await browser.storage.local.get(QUEUE_KEY);
  const raw = stored[QUEUE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isQueuedCapturePayload);
}

// Every queue read-modify-write runs through this chain. flushQueue can take
// seconds; without it, an enqueue landing mid-flush is overwritten by the
// flush's stale write and the capture is silently dropped.
let queueChain: Promise<unknown> = Promise.resolve();

export function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueChain.then(operation, operation);
  queueChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function enqueue(payload: QueuedCapturePayload): Promise<number> {
  return withQueueLock(async () => {
    const queue = await readQueue();
    queue.push(payload);
    // Count + byte budget first so a full queue cannot blow the ~10MB local
    // quota; if other keys still push the write over, drop oldest until it fits.
    trimCaptureQueue(queue);
    for (;;) {
      try {
        await browser.storage.local.set({ [QUEUE_KEY]: queue });
        return queue.length;
      } catch {
        if (queue.length <= 1) return queue.length;
        queue.shift();
        trimCaptureQueue(queue);
      }
    }
  });
}
