import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DOMParser, Event, parseHTML } from "linkedom";
import { extractCurrentPage } from "./defuddle-extract";

const ARTICLE_BODY = "Body copy that is long enough to look like an article. ".repeat(6);
const PAGE_URL = "https://example.com/posts/one";

const globals = globalThis as Record<string, unknown>;
const originalWindow = globals.window;
const originalDocument = globals.document;

/** Load a page into the globals the extractor reads, as a content script sees it. */
function loadPage(head: string): void {
  const { document } = parseHTML(
    `<!doctype html><html><head><title>Article</title>${head}</head><body><article><h1>Article</h1><p>${ARTICLE_BODY}</p></article></body></html>`,
  );
  globals.document = document;
  globals.DOMParser = DOMParser;
  globals.Event = Event;
  // linkedom's parseHTML leaves location unset, and the shadow-flatten request
  // needs the timer pair.
  globals.window = { location: { href: PAGE_URL }, setTimeout, clearTimeout };
}

beforeEach(() => loadPage(""));

afterEach(() => {
  globals.window = originalWindow;
  globals.document = originalDocument;
});

describe("extractCurrentPage favicon", () => {
  test("falls back to origin /favicon.ico when Defuddle reports none", async () => {
    // A page that declares no icon: Defuddle reports no favicon, and the app's own
    // fallback guesses the origin's. Without it the capture loses the favicon seal
    // on every such page.
    const { payload } = await extractCurrentPage();

    expect(payload.favicon).toBe("https://example.com/favicon.ico");
  });

  test("prefers a declared icon link over the guess", async () => {
    loadPage('<link rel="icon" href="/static/icon.svg" />');

    const { payload } = await extractCurrentPage();

    expect(payload.favicon).toBe("https://example.com/static/icon.svg");
  });

  test("ignores an icon that is not http(s)", async () => {
    // A data: or javascript: icon is not something the app can fetch, and the
    // payload parser would drop it anyway.
    loadPage('<link rel="icon" href="data:image/png;base64,xx" />');

    const { payload } = await extractCurrentPage();

    expect(payload.favicon).toBe("https://example.com/favicon.ico");
  });
});