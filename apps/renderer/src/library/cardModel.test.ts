import type { LibraryCard } from "@inkling/contracts";
import { describe, expect, it } from "bun:test";
import { assetUrl } from "./assets.ts";
import { cardView, toCardView } from "./cardModel.ts";
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
  updatedAt: 0,
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

  it.each([
    [
      "2026-11-07T12:00:00Z",
      new Date("2026-11-07T12:00:00Z").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    ],
    ["not a date", "On X"],
  ])("labels an X post published %s as %s", (publishedDate, label) => {
    const social = {
      provider: "x",
      postUrl: "https://x.com/a/status/1",
      postId: "1",
      publishedDate,
    };
    const view = toCardView(card({ kind: "url", metadata: { social } }));
    expect(view.post?.published).toBe(label);
  });

  it.each([
    [{ mediaWidth: 8000, mediaHeight: 5000 }, null, true],
    [{ mediaWidth: 8000, mediaHeight: 5001 }, null, false],
    [{ mediaWidth: 8000, mediaHeight: 5001 }, "/thumbnail.webp", true],
    // BMP and ICO have no size until their thumbnail, and are drawn as they always were.
    [{}, null, true],
  ] as const)("an image of %j with thumbnail %s draws: %s", (metadata, thumbnailPath, draws) => {
    const view = toCardView(
      card({ kind: "image", localAssetPath: "/original.jpg", thumbnailPath, metadata }),
    );
    expect(Boolean(view.image)).toBe(draws);
    expect(view.noPreview).toBe(!draws);
    expect(view.treatment).toBe("media");
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

  it("offers file reveal only for an original local asset, regardless of card kind", () => {
    for (const kind of ["note", "quote", "article", "image", "file"]) {
      expect(toCardView(card({ kind })).hasLocalFile).toBe(false);
      expect(
        toCardView(card({ kind, thumbnailPath: "assets/items/item/thumbnail.webp" })).hasLocalFile,
      ).toBe(false);
      expect(
        toCardView(card({ kind, localAssetPath: "assets/items/item/original.jpg" })).hasLocalFile,
      ).toBe(true);
    }
  });

  it("keeps only web links as links", () => {
    expect(toCardView(card({ sourceUrl: "file:///C:/secret.png" })).webUrl).toBeUndefined();
    expect(toCardView(card({ sourceUrl: "https://example.com" })).webUrl).toBe(
      "https://example.com/",
    );
  });
});

describe("card date labels", () => {
  const hour = 60 * 60 * 1000;
  const saved = card({ createdAt: 1_000 * hour });

  it("keeps a card's view until its label changes, then draws the new label", () => {
    const fresh = cardView(saved, 0, 1_000 * hour + 5 * 60 * 1000);
    expect(fresh.date).toBe("Just now");
    // The clock ticked for another card's label; this one still holds.
    expect(cardView(saved, 1, 1_000 * hour + 59 * 60 * 1000)).toBe(fresh);
    const later = cardView(saved, 2, 1_001 * hour);
    expect(later.date).toBe("Today");
    expect(cardView(saved, 3, 1_023 * hour)).toBe(later);
    expect(cardView(saved, 4, 1_024 * hour).date).not.toBe("Today");
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
