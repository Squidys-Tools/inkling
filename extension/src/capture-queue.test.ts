import { describe, expect, test } from "bun:test";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";
import {
  MAX_CAPTURE_QUEUE_BYTES,
  MAX_CAPTURE_QUEUE_ITEMS,
  removeSettledCaptureEntries,
  trimCaptureQueue,
} from "./capture-queue";

function payload(id: number, htmlBytes: number): PageCapturePayloadV1 {
  return {
    version: 1,
    kind: "page",
    url: `https://example.com/${id}`,
    title: `Item ${id}`,
    defuddledHtml: "a".repeat(htmlBytes),
    text: "",
    imageUrls: [],
  };
}

describe("trimCaptureQueue", () => {
  test("keeps a queue already under both budgets", () => {
    const queue = [payload(1, 100), payload(2, 100)];
    trimCaptureQueue(queue);
    expect(queue).toHaveLength(2);
    expect(queue[0].url).toContain("/1");
    expect(queue[1].url).toContain("/2");
  });

  test("drops oldest past the item cap", () => {
    const queue = Array.from({ length: MAX_CAPTURE_QUEUE_ITEMS + 5 }, (_, i) =>
      payload(i, 10),
    );
    trimCaptureQueue(queue);
    expect(queue).toHaveLength(MAX_CAPTURE_QUEUE_ITEMS);
    expect(queue[0].url).toContain("/5");
    expect(queue[queue.length - 1]!.url).toContain(`/${MAX_CAPTURE_QUEUE_ITEMS + 4}`);
  });

  test("drops oldest when the byte budget is exceeded", () => {
    // Each entry alone is over half the budget, so any pair still overflows.
    const overHalf = Math.floor(MAX_CAPTURE_QUEUE_BYTES / 2) + 1024;
    const queue = [payload(1, overHalf), payload(2, overHalf), payload(3, overHalf)];
    trimCaptureQueue(queue);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.url).toContain("/3");
  });

  test("never drops the newest entry even when it alone is over budget", () => {
    const huge = MAX_CAPTURE_QUEUE_BYTES + 1024;
    const queue = [payload(1, 10), payload(2, huge)];
    trimCaptureQueue(queue);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.url).toContain("/2");
  });
});

describe("removeSettledCaptureEntries", () => {
  test("removes exactly the entries a flush settled", () => {
    const queue = [payload(1, 10), payload(2, 10), payload(3, 10)];
    removeSettledCaptureEntries(queue, [payload(1, 10), payload(3, 10)]);
    expect(queue).toHaveLength(1);
    expect((queue[0] as PageCapturePayloadV1).url).toContain("/2");
  });

  test("keeps a capture appended while the flush was delivering", () => {
    // The flush delivers outside the queue lock, so a capture enqueued mid-flush
    // is at the tail of the stored queue by the time the flush writes. Dropping
    // by position would take it with the batch.
    const batched = payload(1, 10);
    const late = payload(2, 10);
    const queue = [batched, late];
    // The stored copy is a fresh deserialization, not the same object.
    removeSettledCaptureEntries(queue, [payload(1, 10)]);
    expect(queue).toHaveLength(1);
    expect((queue[0] as PageCapturePayloadV1).url).toContain("/2");
  });

  test("two byte-identical captures do not take each other's place", () => {
    const twin = payload(1, 10);
    const queue = [twin, { ...twin }, payload(2, 10)];
    removeSettledCaptureEntries(queue, [payload(1, 10)]);
    expect(queue).toHaveLength(2);
    expect((queue[0] as PageCapturePayloadV1).url).toContain("/1");
    expect((queue[1] as PageCapturePayloadV1).url).toContain("/2");
  });

  test("empties the queue when two identical captures both settled", () => {
    // The same page saved twice, or one save retried: the queue holds two
    // byte-identical entries and the flush delivers both. Settling the shared
    // key once left the twin queued and delivered it again on the next flush,
    // creating a duplicate item in the library.
    const twin = payload(1, 10);
    const queue = [twin, { ...twin }];
    removeSettledCaptureEntries(queue, [{ ...twin }, { ...twin }]);
    expect(queue).toHaveLength(0);
  });

  test("leaves the queue alone when nothing settled", () => {
    const queue = [payload(1, 10), payload(2, 10)];
    removeSettledCaptureEntries(queue, []);
    expect(queue).toHaveLength(2);
  });
});
