import { describe, expect, test } from "bun:test";
import type { NormalizedArticle } from "./ingestion/types";
import type { StoredLibraryItem } from "./libraryApi";
import { enrichDeepLinkCapture } from "./deepLinkEnrichment";

const storedItem: StoredLibraryItem = {
  id: "captured-item",
  kind: "url",
  title: "example.com",
  description: null,
  body: "",
  bodyFormat: "md",
  sourceUrl: "https://example.com/redirect",
  sourceLabel: "example.com",
  localAssetPath: null,
  thumbnailPath: null,
  ocrText: "",
  metadata: { captureSource: "browser extension", text: "" },
  createdAt: 1,
  updatedAt: 1,
  archived: false,
  favorite: false,
};

const article: NormalizedArticle = {
  sourceUrl: "https://example.com/redirect",
  fetchedUrl: "https://example.com/article",
  canonicalUrl: "https://example.com/article",
  title: "Extracted title",
  description: "Extracted description",
  author: "A Writer",
  publishedDate: null,
  html: "<p>Article text</p>",
  text: "Article text",
  imageUrls: ["https://example.com/image.jpg"],
  imageDimensions: [],
  safeEmbeds: [],
  extractor: "defuddle",
};

describe("enrichDeepLinkCapture", () => {
  test("stores extraction after capture without replacing the extension title", async () => {
    let updatedInput:
      | {
          title?: string;
          description?: string;
          body?: string;
          sourceUrl?: string;
          metadataPatch?: Record<string, unknown>;
        }
      | undefined;
    const enriched = await enrichDeepLinkCapture(storedItem, "Extension title", {
      ingestUrl: async (url) => {
        expect(url).toBe("https://example.com/redirect");
        return article;
      },
      updateItem: async (input) => {
        updatedInput = input;
        return { ...storedItem, ...input };
      },
    });

    expect(enriched?.title).toBe("Extension title");
    expect(updatedInput).toMatchObject({
      title: "Extension title",
      description: "Extracted description",
      body: "Article text",
      sourceUrl: "https://example.com/article",
      metadataPatch: {
        sourceUrl: "https://example.com/article",
        text: "Article text",
        extractedText: "Article text",
        author: "A Writer",
        imageUrls: ["https://example.com/image.jpg"],
      },
    });
    expect(updatedInput?.metadataPatch).not.toHaveProperty("publishedDate");
  });

  test("keeps the immediate item usable when extraction fails", async () => {
    const updated = await enrichDeepLinkCapture(storedItem, undefined, {
      ingestUrl: async () => {
        throw new Error("page unavailable");
      },
    });

    expect(updated).toBeNull();
  });

  test("omits unavailable article metadata from the patch", async () => {
    let metadataPatch: Record<string, unknown> | undefined;
    await enrichDeepLinkCapture(storedItem, undefined, {
      ingestUrl: async () => ({
        ...article,
        author: "",
        publishedDate: null,
        html: "",
        imageUrls: [],
        imageDimensions: [],
        safeEmbeds: [],
        social: undefined,
      }),
      updateItem: async (input) => {
        metadataPatch = input.metadataPatch;
        return { ...storedItem, ...input };
      },
    });

    expect(metadataPatch).not.toHaveProperty("author");
    expect(metadataPatch).not.toHaveProperty("publishedDate");
    expect(metadataPatch).not.toHaveProperty("html");
    expect(metadataPatch).not.toHaveProperty("imageUrls");
    expect(metadataPatch).not.toHaveProperty("imageDimensions");
    expect(metadataPatch).not.toHaveProperty("safeEmbeds");
  });
});
