// The queued queue holds payloads that came back out of storage, so every field
// the app reads is checked before it is trusted with a POST.
import { describe, expect, test } from "bun:test";
import { isCaptureMessage, isExtensionCapturePayload } from "./payload";

describe("isExtensionCapturePayload", () => {
  test("accepts the three capture shapes", () => {
    expect(
      isExtensionCapturePayload({ kind: "selection", sourceUrl: "https://e.com", selectedHtml: "", selectedText: "q" }),
    ).toBe(true);
    expect(isExtensionCapturePayload({ kind: "image", pageUrl: "https://e.com", srcUrl: "https://e.com/a.png" })).toBe(true);
    expect(isExtensionCapturePayload({ kind: "video", sourceUrl: "https://e.com/watch" })).toBe(true);
  });

  test("accepts the optional fields the collector may attach", () => {
    expect(
      isExtensionCapturePayload({ kind: "image", pageUrl: "https://e.com", srcUrl: "blob:https://e.com/x", dataUrl: "data:image/png;base64,AA" }),
    ).toBe(true);
    expect(
      isExtensionCapturePayload({ kind: "video", sourceUrl: "https://e.com/watch", title: null }),
    ).toBe(false);
  });

  test("rejects a non-string where the app expects a string", () => {
    // These come back out of storage as whatever was written. A null title or
    // dataUrl reaches the app as JSON and lands in a column it never promised.
    expect(
      isExtensionCapturePayload({ kind: "selection", sourceUrl: "https://e.com", selectedText: "q", title: null }),
    ).toBe(false);
    expect(
      isExtensionCapturePayload({
        kind: "image",
        pageUrl: "https://e.com",
        srcUrl: "https://e.com/a.png",
        dataUrl: { not: "a string" },
      }),
    ).toBe(false);
    expect(isExtensionCapturePayload({ kind: "video", sourceUrl: "https://e.com", title: 42 })).toBe(false);
  });

  test("rejects a shape the app could not read at all", () => {
    expect(isExtensionCapturePayload({ kind: "image" })).toBe(false);
    expect(isExtensionCapturePayload({ kind: "selection", sourceUrl: "https://e.com" })).toBe(false);
    expect(isExtensionCapturePayload({ kind: "unknown" })).toBe(false);
    expect(isExtensionCapturePayload("selection")).toBe(false);
  });
});

describe("isCaptureMessage", () => {
  test("accepts a well-formed envelope", () => {
    expect(
      isCaptureMessage({
        type: "inkling/capture",
        payload: { kind: "video", sourceUrl: "https://e.com/watch" },
      }),
    ).toBe(true);
  });

  test("rejects another message type or a missing payload", () => {
    expect(isCaptureMessage({ type: "inkling/collect", payload: {} })).toBe(false);
    expect(isCaptureMessage({ type: "inkling/capture" })).toBe(false);
    expect(isCaptureMessage(null)).toBe(false);
  });
});
