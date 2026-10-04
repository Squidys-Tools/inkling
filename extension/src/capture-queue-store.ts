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

/**
 * A full local-storage quota, and only that, is worth dropping older captures
 * over. The polyfill rejects a failed set with the browser's lastError message,
 * and both engines spell a full quota "QUOTA_BYTES/QUOTA_ITEMS … quota
 * exceeded". Any other failure — a locked profile, a racing writer, a momentary
 * I/O error — says nothing about space, and destroying the backlog to make room
 * for a capture that was never stored is the exact loss the queue exists to
 * prevent.
 */
function isStorageQuotaError(error: unknown): boolean {
  return /quota/i.test(error instanceof Error ? error.message : String(error));
}

/**
 * Add a capture to the pending queue and report how many are waiting. Returns
 * 0 when storage would not take even the newest entry: nothing older is left to
 * drop, so the caller has to report a failure instead of a phantom entry. A
 * successful enqueue always reports at least 1. Throws when the write failed for
 * a reason eviction cannot fix, so the caller reports that rather than blaming
 * the queue.
 */
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
      } catch (error) {
        if (!isStorageQuotaError(error)) throw error;
        // Nothing older left to drop and the write still fails, so this capture
        // has nowhere to go.
        if (queue.length <= 1) return 0;
        queue.shift();
        trimCaptureQueue(queue);
      }
    }
  });
}
