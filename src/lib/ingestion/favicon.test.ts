import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { extractFallback } from "./fallback";
import { ingestUrl } from "./url-ingestion";

const HTML_WITH_FAVICON = `<!doctype html>
<html>
  <head>
    <title>Example article</title>
    <link rel="icon" href="https://cdn.example.com/icons/site.png" />
    <meta property="og:title" content="Example article" />
  </head>
  <body>
    <article>
      <h1>Example article</h1>
      <p>${"Readable paragraph text that is long enough to extract. ".repeat(8)}</p>
    </article>
  </body>
</html>`;

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("extractFallback favicon", () => {
  test("prefers the declared icon link as an absolute URL", () => {
    const { document } = parseHTML(HTML_WITH_FAVICON);
    const extraction = extractFallback(document, "https://example.com/posts/one");
    expect(extraction.favicon).toBe("https://cdn.example.com/icons/site.png");
  });

  test("falls back to origin /favicon.ico when no icon link exists", () => {
    const { document } = parseHTML(
      "<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>",
    );
    const extraction = extractFallback(document, "https://example.com/posts/one");
    expect(extraction.favicon).toBe("https://example.com/favicon.ico");
  });

  test("resolves a relative icon against the page's declared base", () => {
    // A page that sets <base href> sends its icon somewhere else entirely.
    // Resolving against the capture URL cached the wrong file, usually a 404.
    const { document } = parseHTML(`<!doctype html><html><head><title>x</title>
      <base href="https://cdn.example.org/assets/" />
      <link rel="icon" href="icon.png" />
      </head><body><p>hi</p></body></html>`);
    const extraction = extractFallback(document, "https://example.com/posts/one");
    expect(extraction.favicon).toBe("https://cdn.example.org/assets/icon.png");
  });

  test("the /favicon.ico guess stays on the site root despite a declared base", () => {
    // /favicon.ico is a well-known path on the origin, so a <base> pointing at a
    // subdirectory must not turn the guess into .../assets/favicon.ico.
    const { document } = parseHTML(`<!doctype html><html><head><title>x</title>
      <base href="https://example.com/app/" />
      </head><body><p>hi</p></body></html>`);
    const extraction = extractFallback(document, "https://example.com/posts/one");
    expect(extraction.favicon).toBe("https://example.com/favicon.ico");
  });

  test("ignores a declared base that is not http(s)", () => {
    const { document } = parseHTML(`<!doctype html><html><head><title>x</title>
      <base href="javascript:alert(1)" />
      <link rel="icon" href="icon.png" />
      </head><body><p>hi</p></body></html>`);
    const extraction = extractFallback(document, "https://example.com/posts/one");
    expect(extraction.favicon).toBe("https://example.com/posts/icon.png");
  });
});

describe("ingestUrl favicon", () => {
  test("carries a declared favicon onto the normalized article", async () => {
    const article = await ingestUrl("https://example.com/posts/one", {
      fetch: async (input) => {
        const url = String(input);
        if (url === "https://example.com/posts/one") return htmlResponse(HTML_WITH_FAVICON);
        throw new Error(`unexpected fetch ${url}`);
      },
    });
    expect(article.favicon).toBe("https://cdn.example.com/icons/site.png");
  });

  test("merges fallback favicon when defuddle omits one", async () => {
    const html = `<!doctype html>
      <html><head><title>Only title</title>
      <link rel="icon" href="/static/icon.svg" />
      </head><body><article><p>${"Body copy for extraction. ".repeat(20)}</p></article></body></html>`;
    const article = await ingestUrl("https://blog.example.org/deep/path", {
      fetch: async () => htmlResponse(html),
    });
    expect(article.favicon).toBe("https://blog.example.org/static/icon.svg");
  });
});
