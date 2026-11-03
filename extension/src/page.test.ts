import { describe, expect, test } from "bun:test";
import { toCardView } from "../../apps/renderer/src/library/cardModel.ts";
import { pageChoices } from "./page";

const facts = (fields: Record<string, unknown> = {}) => ({
  contentType: "text/html",
  selection: "",
  description: "",
  image: "",
  width: 0,
  height: 0,
  ...fields,
});

const preview = (tab: { url: string; title?: string }, read = facts()) =>
  (pageChoices(tab, read) ?? []).map((choice) => {
    const { payload, card } = choice.build(choice.field?.value ?? "");
    return { id: choice.id, noun: choice.noun, kind: toCardView(card).kind, payload };
  });

describe("what the popup offers for a tab", () => {
  test("each page shows as the card the library will make of it", () => {
    expect(preview({ url: "https://example.com/essay", title: "An essay" })).toEqual([
      {
        id: "page",
        noun: "page",
        kind: "Article",
        payload: expect.objectContaining({ kind: "page", title: "An essay" }),
      },
    ]);
    expect(
      preview({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "A video" }),
    ).toEqual([expect.objectContaining({ noun: "video", kind: "Video" })]);
    expect(
      preview({
        url: "https://x.com/jack/status/20",
        title: 'jack on X: "just setting up my twttr" / X',
      }),
    ).toEqual([expect.objectContaining({ noun: "post", kind: "Post" })]);
    expect(
      preview(
        { url: "https://example.com/paper.pdf", title: "paper.pdf" },
        facts({ contentType: "application/pdf" }),
      ),
    ).toEqual([expect.objectContaining({ noun: "PDF", kind: "Article" })]);
  });

  test("a selection is offered as a quote first, and the page is still there", () => {
    const choices = preview(
      { url: "https://www.example.com/essay", title: "An essay" },
      facts({ selection: "  Keep this.\n" }),
    );
    expect(choices.map(({ id, kind }) => [id, kind])).toEqual([
      ["quote", "Quote"],
      ["page", "Article"],
    ]);
    expect(choices[0].payload).toEqual({
      version: 1,
      kind: "quote",
      url: "https://www.example.com/essay",
      selection: "Keep this.",
      attribution: "An essay",
    });
  });

  test("an image tab saves the image itself", () => {
    expect(
      preview(
        { url: "https://cdn.example.com/fox.png", title: "fox.png (800×600)" },
        facts({ contentType: "image/png", width: 800, height: 600, selection: "ignored" }),
      ),
    ).toEqual([
      {
        id: "image",
        noun: "image",
        kind: "Image",
        payload: expect.objectContaining({
          kind: "image",
          url: "https://cdn.example.com/fox.png",
          imageUrl: "https://cdn.example.com/fox.png",
        }),
      },
    ]);
  });

  test("a page the extension cannot read falls back to its address and title", () => {
    expect(
      pageChoices({ url: "https://chromewebstore.google.com/", title: "Store" }, null),
    ).toHaveLength(1);
    for (const url of ["chrome://newtab/", "file:///home/me/notes.txt", "about:blank", ""]) {
      expect(pageChoices({ url, title: "Not a web page" }, null)).toBeNull();
    }
  });

  test("page facts are untrusted: only a web image address reaches the card", () => {
    const [choice] =
      pageChoices(
        { url: "https://example.com/" },
        facts({ image: "javascript:alert(1)", description: 42 }),
      ) ?? [];
    const { card } = choice.build("");
    expect(card.metadata.imageUrls).toEqual([]);
    expect(card.description).toBeNull();
  });
});
