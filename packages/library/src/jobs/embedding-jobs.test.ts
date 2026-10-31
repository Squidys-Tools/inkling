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
});
