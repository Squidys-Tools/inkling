// Pending page-capture queue budget. chrome.storage.local is ~10MB without
// the unlimitedStorage permission (see manifest.*.json), so the queue must be
// bounded by bytes as well as count — a full 50 × MAX_DEFUDDLED_HTML_BYTES
// queue would exhaust the quota and fail the write, dropping captures.
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

export const MAX_CAPTURE_QUEUE_ITEMS = 50;
export const MAX_CAPTURE_QUEUE_BYTES = 4 * 1024 * 1024;

function capturePayloadBytes(payload: PageCapturePayloadV1): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  } catch {
    // Unmeasurable payload: treat as over-budget so oldest entries drop first.
    return MAX_CAPTURE_QUEUE_BYTES;
  }
}

/** Drop oldest entries until count and byte budgets fit. Always keeps the newest. */
export function trimCaptureQueue(queue: PageCapturePayloadV1[]): void {
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
