import type { LibraryCard } from "@inkling/contracts";
import { describe, expect, it } from "bun:test";
import { assetUrl } from "./assets.ts";
import { toCardView } from "./cardModel.ts";
import { scopeFromPath } from "./scope.ts";

const card = (fields: Partial<LibraryCard> = {}): LibraryCard => ({
  id: "item",
  kind: "image",
  title: "A title",
  description: null,
  sourceUrl: null,
  sourceLabel: null,
  localAssetPath: null,
  thumbnailPath: null,
  ocrText: "",
  createdAt: 0,
  archived: false,
  metadata: {},
  hasArticleContent: false,
  ...fields,
});

describe("card views", () => {
  it.each([
    ["url", {}, "Article", "article"],
    ["embed", {}, "Video", "file"],
    ["tweet", {}, "Post", "file"],
    ["recipe", {}, "Note", "note"],
    ["article", { sourceUrl: "https://youtu.be/dQw4w9WgXcQ" }, "Video", "video"],
    [
      "url",
      { metadata: { social: { provider: "x", postUrl: "https://x.com/a/status/1", postId: "1" } } },
      "Post",
      "media",
    ],
  ] as const)("shows a stored %s as its own kind", (kind, fields, shown, treatment) => {
    const view = toCardView(card({ kind, ...fields }));
    expect(view.kind).toBe(shown);
    expect(view.treatment).toBe(treatment);
  });

  it("uses a video link's poster until a thumbnail exists", () => {
    const view = toCardView(
      card({ kind: "url", sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    );
    expect(view.image).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(view.media).toBe("video");
  });

  it("takes the image size from the remote image it shows", () => {
    const view = toCardView(
      card({
        kind: "article",
        metadata: {
          imageUrls: ["javascript:alert(1)", "https://example.com/a.jpg"],
          imageDimensions: [
            { url: "https://example.com/other.jpg", width: 10, height: 10 },
            { url: "https://example.com/a.jpg", width: 200, height: 100 },
          ],
        },
      }),
    );
    expect(view.image).toBe("https://example.com/a.jpg");
    expect(view.aspectRatio).toBe(2);
  });

  it("keeps only web links as links", () => {
    expect(toCardView(card({ sourceUrl: "file:///C:/secret.png" })).webUrl).toBeUndefined();
    expect(toCardView(card({ sourceUrl: "https://example.com" })).webUrl).toBe(
      "https://example.com/",
    );
  });
});

describe("asset urls", () => {
  it("serves only paths inside the library's assets folder", () => {
    expect(assetUrl("assets/items/a b/photo.png", true)).toBe(
      "app://local/library-assets/items/a%20b/photo.png",
    );
    expect(assetUrl("assets\\items\\a\\photo.png", true)).toBe(
      "app://local/library-assets/items/a/photo.png",
    );
    for (const path of [
      "assets/items/a/../../library.sqlite3",
      "assets//items/a.png",
      "assets/C:/Users/me/photo.png",
      "/etc/passwd",
      "https://example.com/a.png",
    ])
      expect(assetUrl(path, true)).toBeUndefined();
  });
});

describe("library routes", () => {
  it.each([
    ["/", { _tag: "Active" }],
    ["/archive", { _tag: "Archived" }],
    ["/space/a%20b", { _tag: "Space", spaceId: "a b" }],
    ["/item/x", null],
    ["/space/a/extra", null],
  ] as const)("%s shows %o", (path, scope) => {
    expect(scopeFromPath(path)).toEqual(scope);
  });
});
