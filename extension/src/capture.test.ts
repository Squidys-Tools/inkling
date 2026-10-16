import { describe, expect, test } from "bun:test";
import { buildUrlCapturePayload } from "./capture";

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

  test("uses the site name when a title is missing and rejects non-web URLs", () => {
    expect(buildUrlCapturePayload("https://example.com/article", "").title).toBe("example.com");
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
});
