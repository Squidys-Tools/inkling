import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { extractJsonLdMetadata } from "./json-ld.ts";

function metadata(...blocks: unknown[]) {
  const scripts = blocks
    .map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
    .join("");
  const { document } = parseHTML(
    `<html><head>${scripts}<script type="application/ld+json">{</script></head></html>`,
  );
  return extractJsonLdMetadata(document, "https://example.com/post");
}

test("reads article metadata from arrays, graphs and nested entities", () => {
  expect(
    metadata(
      [{ "@type": "WebSite", name: "Site" }],
      {
        "@graph": [
          {
            "@type": ["https://schema.org/NewsArticle"],
            headline: " A   headline ",
            author: [
              { name: "Ada Lovelace" },
              { givenName: "Alan", familyName: "Turing" },
              "Ada Lovelace",
            ],
            datePublished: "2026-03-19",
            image: [{ url: "/cover.jpg" }, "https://example.com/cover.jpg", "javascript:alert(1)"],
          },
        ],
      },
      { "@type": "WebPage", mainEntityOfPage: { "@type": "Article", description: "Deck" } },
    ),
  ).toEqual({
    title: "A headline",
    description: "Deck",
    author: "Ada Lovelace, Alan Turing",
    publishedDate: "2026-03-19",
    imageUrls: ["https://example.com/cover.jpg"],
  });
});

test("ignores comment bodies and other non-article types", () => {
  expect(metadata({ "@type": "Comment", text: "first!", author: "Troll" })).toEqual({});
});
