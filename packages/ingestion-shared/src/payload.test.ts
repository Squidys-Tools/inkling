import { describe, expect, test } from "bun:test";
import {
  buildPageCapturePayload,
  INGESTION_PAYLOAD_VERSION,
  isPageCapturePayload,
  parsePageCapturePayload,
  PayloadValidationError,
} from "./payload";

const BASE = {
  url: "https://example.com/articles/roast-dinner",
  title: "The Perfect Roast",
  defuddledHtml: "<article><p>Hello</p></article>",
  text: "Hello",
};

describe("parsePageCapturePayload", () => {
  test("accepts a minimal valid v1 page payload", () => {
    const payload = parsePageCapturePayload({ version: 1, kind: "page", ...BASE });
    expect(payload.version).toBe(1);
    expect(payload.kind).toBe("page");
    expect(payload.imageUrls).toEqual([]);
    expect(payload.author).toBeUndefined();
  });

  test("keeps optional metadata when present", () => {
    const payload = parsePageCapturePayload({
      version: 1,
      kind: "page",
      ...BASE,
      author: "A. Cook",
      publishedDate: "2026-09-01",
      imageUrls: ["https://example.com/img.jpg"],
    });
    expect(payload.author).toBe("A. Cook");
    expect(payload.publishedDate).toBe("2026-09-01");
    expect(payload.imageUrls).toEqual(["https://example.com/img.jpg"]);
  });

  test("dedupes image URLs and drops non-http entries", () => {
    const payload = parsePageCapturePayload({
      version: 1,
      kind: "page",
      ...BASE,
      imageUrls: [
        "https://example.com/a.jpg",
        "https://example.com/a.jpg",
        "data:image/png;base64,xx",
        "not-a-url",
      ],
    });
    expect(payload.imageUrls).toEqual(["https://example.com/a.jpg"]);
  });

  test("rejects wrong version and kind", () => {
    expect(() => parsePageCapturePayload({ ...BASE, version: 2, kind: "page" })).toThrow(
      PayloadValidationError,
    );
    expect(() => parsePageCapturePayload({ ...BASE, version: 1, kind: "note" })).toThrow(
      PayloadValidationError,
    );
  });

  test("rejects bad URLs, blank titles, and non-array imageUrls", () => {
    expect(() =>
      parsePageCapturePayload({ ...BASE, version: 1, kind: "page", url: "notaurl" }),
    ).toThrow(PayloadValidationError);
    expect(() =>
      parsePageCapturePayload({ ...BASE, version: 1, kind: "page", url: "file:///etc/passwd" }),
    ).toThrow(PayloadValidationError);
    expect(() =>
      parsePageCapturePayload({ ...BASE, version: 1, kind: "page", title: "  " }),
    ).toThrow(PayloadValidationError);
    expect(() =>
      parsePageCapturePayload({ ...BASE, version: 1, kind: "page", imageUrls: "x" }),
    ).toThrow(PayloadValidationError);
    expect(() => parsePageCapturePayload(null)).toThrow(PayloadValidationError);
  });

  test("rejects oversized content so storage writes stay bounded", () => {
    expect(() =>
      parsePageCapturePayload({ ...BASE, version: 1, kind: "page", defuddledHtml: "x".repeat(3 * 1024 * 1024) }),
    ).toThrow(PayloadValidationError);
  });
});

describe("buildPageCapturePayload", () => {
  test("falls back to the hostname when the title is blank", () => {
    const payload = buildPageCapturePayload({ ...BASE, title: "   " });
    expect(payload.title).toBe("example.com");
  });

  test(" round-trips through the parser", () => {
    const payload = buildPageCapturePayload({ ...BASE, author: "A. Cook" });
    expect(isPageCapturePayload(JSON.parse(JSON.stringify(payload)))).toBe(true);
    expect(INGESTION_PAYLOAD_VERSION).toBe(1);
  });
});
