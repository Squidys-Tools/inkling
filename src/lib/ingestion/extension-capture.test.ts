import { describe, expect, test } from "bun:test";
import {
  EXTENSION_IMAGE_DATA_URL_MAX_BYTES,
  cardKindForExtensionCapture,
  mapExtensionImage,
  mapExtensionSelection,
  mapExtensionVideo,
} from "./extension-capture";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("mapExtensionSelection", () => {
  test("quote keeps readable text with source attribution", () => {
    const receipt = mapExtensionSelection({
      sourceUrl: "https://example.com/essay",
      selectedHtml: "<p>Keep <strong>this</strong> passage.</p>",
      selectedText: "Keep this passage.",
      title: "Great Essay",
    });
    expect(receipt?.body).toBe("Keep this passage.");
    expect(receipt?.attribution).toBe("Great Essay");
    expect(receipt?.sourceUrl).toBe("https://example.com/essay");
  });

  test("never trusts extension HTML: scripts are stripped, body falls back to text", () => {
    const receipt = mapExtensionSelection({
      sourceUrl: "https://example.com/page",
      selectedHtml: '<p onclick="evil()">Hi</p><script>alert(1)</script><iframe src="https://evil.example/x"></iframe>',
      selectedText: "",
    });
    expect(receipt?.body).toBe("Hi");
    expect(receipt?.sanitizedHtml).not.toContain("<script");
    expect(receipt?.sanitizedHtml).not.toContain("onclick");
    expect(receipt?.sanitizedHtml).not.toContain("<iframe");
  });

  test("truncates overlong selections and falls back to hostname attribution", () => {
    const receipt = mapExtensionSelection({
      sourceUrl: "https://www.example.com/post",
      selectedHtml: "",
      selectedText: `  ${"x".repeat(2000)}  `,
    });
    expect(receipt?.body).toBe("x".repeat(1500));
    expect(receipt?.attribution).toBe("example.com");
  });

  test("rejects non-http sources and empty selections", () => {
    expect(
      mapExtensionSelection({ sourceUrl: "javascript:alert(1)", selectedHtml: "", selectedText: "hi" }),
    ).toBeNull();
    expect(mapExtensionSelection({ sourceUrl: "https://example.com/", selectedHtml: "", selectedText: "   " })).toBeNull();
  });
});

describe("mapExtensionImage", () => {
  test("http srcUrl downloads through the asset pipeline", () => {
    const receipt = mapExtensionImage({
      pageUrl: "https://example.com/post",
      srcUrl: "https://cdn.example.com/photo.jpg",
      alt: "Alpine lake",
    });
    expect(receipt).toMatchObject({
      via: "download",
      downloadUrl: "https://cdn.example.com/photo.jpg",
      fileName: "photo.jpg",
      alt: "Alpine lake",
    });
  });

  test("blob sources use the dataUrl fallback under the cap", () => {
    const receipt = mapExtensionImage({
      pageUrl: "https://example.com/canvas",
      srcUrl: "blob:https://example.com/abc",
      dataUrl: TINY_PNG,
    });
    expect(receipt?.via).toBe("data-url");
    if (receipt?.via === "data-url") {
      expect(receipt.mimeType).toBe("image/png");
      expect(receipt.byteLength).toBeGreaterThan(0);
      expect(receipt.byteLength).toBeLessThanOrEqual(EXTENSION_IMAGE_DATA_URL_MAX_BYTES);
    }
  });

  test("oversized or non-image dataUrls are rejected", () => {
    const paddingLength = Math.ceil((EXTENSION_IMAGE_DATA_URL_MAX_BYTES + 16) / 3) * 4;
    const huge = `data:image/png;base64,${"A".repeat(paddingLength)}`;
    expect(
      mapExtensionImage({ pageUrl: "https://example.com/", srcUrl: "blob:https://example.com/x", dataUrl: huge }),
    ).toBeNull();
    expect(
      mapExtensionImage({
        pageUrl: "https://example.com/",
        srcUrl: "blob:https://example.com/x",
        dataUrl: "data:text/plain;base64,aGk=",
      }),
    ).toBeNull();
    expect(mapExtensionImage({ pageUrl: "https://example.com/", srcUrl: "" })).toBeNull();
    expect(mapExtensionImage({ pageUrl: "https://example.com/", srcUrl: "/relative/photo.jpg" })?.via).toBe(
      "download",
    );
  });
});

describe("mapExtensionVideo", () => {
  test("YouTube watch URLs pass through to the embed path", () => {
    const video = mapExtensionVideo({ sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(video?.provider).toBe("youtube");
    expect(video?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  test("Vimeo URLs pass through; other pages do not", () => {
    expect(mapExtensionVideo({ sourceUrl: "https://vimeo.com/123456789" })?.provider).toBe("vimeo");
    expect(mapExtensionVideo({ sourceUrl: "https://example.com/article" })).toBeNull();
  });
});

describe("card-type correctness", () => {
  test("quote, image, video, and article each get their own card type", () => {
    const kinds = new Set([
      cardKindForExtensionCapture("selection"),
      cardKindForExtensionCapture("image"),
      cardKindForExtensionCapture("video"),
      cardKindForExtensionCapture("article"),
    ]);
    expect(kinds).toEqual(new Set(["Quote", "Image", "Video", "Article"]));
  });

  test("no extension capture collapses into a generic bookmark", () => {
    for (const kind of ["selection", "image", "video", "article"] as const) {
      expect(cardKindForExtensionCapture(kind)).not.toBe("File");
    }
  });
});
