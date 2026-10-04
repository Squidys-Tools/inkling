// Pending page-capture queue budget. chrome.storage.local is ~10MB without
// the unlimitedStorage permission (see manifest.*.json), so the queue must be
// bounded by bytes as well as count — a full 50 × MAX_DEFUDDLED_HTML_BYTES
// queue would exhaust the quota and fail the write, dropping captures.
export const MAX_CAPTURE_QUEUE_ITEMS = 50;
export const MAX_CAPTURE_QUEUE_BYTES = 4 * 1024 * 1024;

function capturePayloadBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  } catch {
    // Unmeasurable payload: treat as over-budget so oldest entries drop first.
    return MAX_CAPTURE_QUEUE_BYTES;
  }
}

/** Drop oldest entries until count and byte budgets fit. Always keeps the newest. */
export function trimCaptureQueue(queue: unknown[]): void {
  const sizes = queue.map(capturePayloadBytes);
  let total = sizes.reduce((sum, size) => sum + size, 0);
  let index = 0;
  while (
    queue.length > 1 &&
    (queue.length > MAX_CAPTURE_QUEUE_ITEMS || total > MAX_CAPTURE_QUEUE_BYTES)
  ) {
    total -= sizes[index];
    index += 1;
    queue.shift();
  }
}

/** Identity of one queued entry, across a storage round trip. */
function captureQueueEntryKey(payload: unknown): string {
  return JSON.stringify(payload);
}

/**
 * Remove in place one entry per settled payload — what a flush delivered or gave
 * up on. Keys, not positions: a capture appended while the flush was delivering
 * is at the tail, and must survive the flush's write. Counts, not membership: two
 * queued captures can be byte-identical (the same selection saved twice, a
 * retried save), so a set would settle the key once and leave the twin queued
 * for a duplicate delivery on the next flush.
 */
export function removeSettledCaptureEntries(queue: unknown[], settled: Iterable<unknown>): void {
  const remaining = new Map<string, number>();
  for (const payload of settled) {
    const key = captureQueueEntryKey(payload);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  let index = 0;
  while (index < queue.length) {
    const key = captureQueueEntryKey(queue[index]);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      queue.splice(index, 1);
      continue;
    }
    index += 1;
  }
}
