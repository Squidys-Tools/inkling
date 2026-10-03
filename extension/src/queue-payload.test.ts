import { describe, expect, test } from "bun:test";
import { isQueuedCapturePayload } from "./queue-payload";
import { trimCaptureQueue } from "./capture-queue";

const pagePayload = {
  version: 1,
  kind: "page",
  url: "https://example.com/article",
  title: "An article",
  defuddledHtml: "<p>body</p>",
  text: "body",
  imageUrls: [],
};

describe("isQueuedCapturePayload", () => {
  test("accepts a page capture", () => {
    expect(isQueuedCapturePayload(pagePayload)).toBe(true);
  });

  test("accepts a media capture so an offline save is not lost", () => {
    // Regression: selection, image, and video saves used to be discarded when
    // the app was closed, because the queue only understood page payloads.
    expect(isQueuedCapturePayload({ kind: "image", pageUrl: "https://example.com", srcUrl: "https://example.com/a.png" })).toBe(true);
    expect(isQueuedCapturePayload({ kind: "video", sourceUrl: "https://example.com/watch" })).toBe(true);
    expect(
      isQueuedCapturePayload({
        kind: "selection",
        sourceUrl: "https://example.com",
        selectedHtml: "",
        selectedText: "quoted",
      }),
    ).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isQueuedCapturePayload(null)).toBe(false);
    expect(isQueuedCapturePayload("queued")).toBe(false);
    expect(isQueuedCapturePayload({ kind: "unknown" })).toBe(false);
    expect(isQueuedCapturePayload({ kind: "image" })).toBe(false);
  });
});

describe("trimCaptureQueue with media payloads", () => {
  test("measures and drops media entries like page entries", () => {
    const queue: unknown[] = Array.from({ length: 60 }, () => ({
      kind: "image",
      pageUrl: "https://example.com",
      srcUrl: "https://example.com/a.png",
    }));
    trimCaptureQueue(queue);
    expect(queue.length).toBe(50);
  });
});
