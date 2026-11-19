import { expect, test } from "bun:test";
import { embeddingText } from "./embedding-jobs.ts";

test("embedding text keeps the shared document inputs and markdown projection", () => {
  expect(
    embeddingText({
      title: "Reading list",
      description: "ignored description",
      body: "## Nomic\n\nA **local** snake_case model &amp; more.",
      bodyFormat: "md",
      ocrText: "Cover text",
      metadata: { text: "ignored metadata" },
    }),
  ).toBe("Reading list\n\nNomic A local snake_case model & more.\n\nCover text");
  for (const [metadata, expected] of [
    [{ text: "Article", extractedText: "Article" }, "Article"],
    [{ text: "Summary", extractedText: "Article" }, "Summary\n\nArticle"],
    [{ extractedText: "Article" }, "Article"],
    [{ text: "Article" }, "Article"],
    [{ text: "", extractedText: "" }, null],
  ] as const) {
    expect(
      embeddingText({
        title: "",
        description: "",
        body: "",
        bodyFormat: "md",
        ocrText: "",
        metadata,
      }),
    ).toBe(expected);
  }
});
