import { describe, expect, test } from "bun:test";
import {
  buildPageCapturePayload,
  INGESTION_PAYLOAD_VERSION,
  isPageCapturePayload,
  MAX_AUTHOR_LENGTH,
  MAX_PUBLISHED_DATE_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
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
      favicon: "https://example.com/favicon.ico",
    });
    expect(payload.author).toBe("A. Cook");
    expect(payload.publishedDate).toBe("2026-09-01");
    expect(payload.imageUrls).toEqual(["https://example.com/img.jpg"]);
    expect(payload.favicon).toBe("https://example.com/favicon.ico");
  });

  test("drops a non-http favicon without failing the capture", () => {
    const payload = parsePageCapturePayload({
      version: 1,
      kind: "page",
      ...BASE,
      favicon: "data:image/png;base64,xx",
    });
    expect(payload.favicon).toBeUndefined();
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

// A hostile page controls every string in this payload. The receiver truncates
// these fields, so the producer truncates them too: the capture survives and
// the cost crossing IPC and chrome.storage stays bounded.
describe("untrusted string bounds", () => {
  test("truncates an inflated article body instead of failing the capture", () => {
    const payload = parsePageCapturePayload({
      version: 1,
      kind: "page",
      ...BASE,
      text: "x".repeat(MAX_TEXT_LENGTH + 5_000),
    });
    expect(payload.text).toHaveLength(MAX_TEXT_LENGTH);
  });

  test("truncates title, author, and publishedDate to the receiver's caps", () => {
    const payload = parsePageCapturePayload({
      version: 1,
      kind: "page",
      ...BASE,
      title: "t".repeat(MAX_TITLE_LENGTH + 100),
      author: "a".repeat(MAX_AUTHOR_LENGTH + 100),
      publishedDate: "2026-09-01T00:00:00.000Z".repeat(10),
    });
    expect(payload.title).toHaveLength(MAX_TITLE_LENGTH);
    expect(payload.author).toHaveLength(MAX_AUTHOR_LENGTH);
    expect(payload.publishedDate).toHaveLength(MAX_PUBLISHED_DATE_LENGTH);
  });

  test("never splits a surrogate pair when clamping", () => {
    const payload = parsePageCapturePayload({
      version: 1,
      kind: "page",
      ...BASE,
      title: `a${"\u{1F600}".repeat(MAX_TITLE_LENGTH)}`,
    });
    expect(payload.title).toBe(`a${"\u{1F600}".repeat((MAX_TITLE_LENGTH - 1) / 2)}`);
  });

  test("rejects an over-long capture URL, matching the receiver", () => {
    const long = `https://example.com/${"p".repeat(MAX_URL_LENGTH)}`;
    expect(() => parsePageCapturePayload({ ...BASE, version: 1, kind: "page", url: long })).toThrow(
      PayloadValidationError,
    );
  });

  test("drops an over-long image URL rather than the whole capture", () => {
    const payload = parsePageCapturePayload({
      version: 1,
      kind: "page",
      ...BASE,
      imageUrls: [`https://example.com/${"i".repeat(MAX_URL_LENGTH)}`, "https://example.com/ok.jpg"],
    });
    expect(payload.imageUrls).toEqual(["https://example.com/ok.jpg"]);
  });

  test("build applies the same bounds as the parser", () => {
    const payload = buildPageCapturePayload({ ...BASE, title: "t".repeat(MAX_TITLE_LENGTH + 100) });
    expect(payload.title).toHaveLength(MAX_TITLE_LENGTH);
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

  test("carries an http favicon through build", () => {
    const payload = buildPageCapturePayload({
      ...BASE,
      favicon: "https://example.com/icon.png",
    });
    expect(payload.favicon).toBe("https://example.com/icon.png");
  });
});
