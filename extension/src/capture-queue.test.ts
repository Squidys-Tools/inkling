import { describe, expect, test } from "bun:test";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";
import {
  MAX_CAPTURE_QUEUE_BYTES,
  MAX_CAPTURE_QUEUE_ITEMS,
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
