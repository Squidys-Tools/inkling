import { describe, expect, test } from "bun:test";
import {
  buildImageCapturePayload,
  buildQuoteCapturePayload,
  buildUrlCapturePayload,
} from "./capture";

describe("URL capture payload", () => {
  test("keeps the selected URL and title without extracting page content", () => {
    expect(buildUrlCapturePayload("https://example.com/article", "A saved page")).toEqual({
      version: 1,
      kind: "page",
      url: "https://example.com/article",
      title: "A saved page",
      defuddledHtml: "",
      text: "",
      imageUrls: [],
    });
  });

  test("leaves a missing title blank for the app to fill and rejects non-web URLs", () => {
    expect(buildUrlCapturePayload("https://example.com/article", "  ").title).toBe("");
    expect(() => buildUrlCapturePayload("file:///etc/passwd", "Local file")).toThrow();
    expect(() =>
      buildUrlCapturePayload("https://user:pass@example.com/article", "Credential URL"),
    ).toThrow();
    expect(() =>
      buildUrlCapturePayload(`https://example.com/${"a".repeat(8_200)}`, "Long URL"),
    ).toThrow();
    expect(
      buildUrlCapturePayload("https://example.com/article", "x".repeat(510)).title,
    ).toHaveLength(500);
  });

  test("quotes keep the library's cut and images need a web address", () => {
    expect(
      buildQuoteCapturePayload("https://www.example.com/a", ` ${"q".repeat(1_600)} `, ""),
    ).toEqual({
      version: 1,
      kind: "quote",
      url: "https://www.example.com/a",
      selection: "q".repeat(1_500),
      attribution: "example.com",
    });
    expect(() => buildQuoteCapturePayload("https://example.com/a", "   ", "A")).toThrow();
    expect(
      buildImageCapturePayload("https://example.com/a", "https://cdn.example.com/b.png", "Alt"),
    ).toMatchObject({ kind: "image", imageUrl: "https://cdn.example.com/b.png", alt: "Alt" });
    expect(() =>
      buildImageCapturePayload("https://example.com/a", "data:image/png;base64,AAAA", ""),
    ).toThrow("web address");
  });
});
