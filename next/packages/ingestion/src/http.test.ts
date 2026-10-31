import { expect, test } from "bun:test";
import { isUrlIngestionError } from "./errors.ts";
import { ingestUrl } from "./url-ingestion.ts";

const article = `<html><head><title>Saved page</title></head><body><article>
  <h1>Saved page</h1><p>${"A paragraph worth keeping for later reading. ".repeat(20)}</p>
</article></body></html>`;

function stubFetch(...responses: (() => Response)[]) {
  const requested: string[] = [];
  const signals: AbortSignal[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requested.push(String(url));
    if (init?.signal) signals.push(init.signal);
    const next = responses[Math.min(requested.length, responses.length) - 1];
    return next();
  }) as typeof globalThis.fetch;
  return { fetch, requested, signals };
}

// Names under nip.io resolve to the address they spell, as the real service does.
const lookupHost = async (hostname: string) => [
  {
    address: hostname.endsWith(".nip.io") ? hostname.slice(0, -".nip.io".length) : "93.184.215.14",
  },
];

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { "content-type": "text/html", ...init.headers } });

async function ingestionError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isUrlIngestionError(error)) return error;
    throw error;
  }
  throw new Error("expected ingestion to fail");
}

test("a transient server error is retried before the capture gives up", async () => {
  const { fetch, requested } = stubFetch(
    () => html("busy", { status: 503 }),
    () => html(article),
  );
  const result = await ingestUrl("https://example.com/post", { fetch, lookupHost });
  expect(result.title).toBe("Saved page");
  expect(requested).toEqual(["https://example.com/post", "https://example.com/post"]);
});

test("a Retry-After longer than the time budget fails as a timeout instead of retrying early", async () => {
  const { fetch, requested } = stubFetch(() =>
    html("slow down", { status: 429, headers: { "retry-after": "120" } }),
  );
  const error = await ingestionError(
    ingestUrl("https://example.com/post", { fetch, lookupHost, timeoutMs: 50 }),
  );
  expect(error.code).toBe("timeout");
  expect(requested).toHaveLength(1);
});

test("a missing page fails on the first answer without retrying", async () => {
  const { fetch, requested } = stubFetch(() => html("gone", { status: 404 }));
  const error = await ingestionError(ingestUrl("https://example.com/post", { fetch, lookupHost }));
  expect(error).toMatchObject({ code: "http-error", details: { status: 404 } });
  expect(requested).toHaveLength(1);
});

test("a page past the byte limit is refused while it streams", async () => {
  const { fetch } = stubFetch(() => html(article));
  const error = await ingestionError(
    ingestUrl("https://example.com/post", { fetch, lookupHost, maxResponseBytes: 64 }),
  );
  expect(error.code).toBe("content-too-large");
});

test("a failing video provider leaves the link indexed with its plain label", async () => {
  const { fetch, requested } = stubFetch(() => {
    throw new TypeError("network down");
  });
  const result = await ingestUrl("https://www.youtube.com/watch?v=abc12345678", {
    fetch,
    lookupHost,
  });
  expect(result.title).toBe("YouTube video");
  expect(result.safeEmbeds).toHaveLength(1);
  // A dropped connection counts as transient, so it was tried three times.
  expect(requested).toHaveLength(3);
});

// regression: the private-network check read only the host name's text.
test("a host that resolves to a private address is refused on the first hop and after a redirect", async () => {
  const direct = stubFetch(() => html(article));
  const refused = await ingestionError(
    ingestUrl("https://127.0.0.1.nip.io/post", { fetch: direct.fetch, lookupHost }),
  );
  expect(refused.code).toBe("invalid-url");
  expect(direct.requested).toEqual([]);

  const redirected = stubFetch(
    () => html("", { status: 302, headers: { location: "https://10.0.0.1.nip.io/admin" } }),
    () => html(article),
  );
  const afterRedirect = await ingestionError(
    ingestUrl("https://example.com/post", { fetch: redirected.fetch, lookupHost }),
  );
  expect(afterRedirect.code).toBe("invalid-url");
  expect(redirected.requested).toEqual(["https://example.com/post"]);
  // The redirect's body was left unread, so its request is aborted.
  expect(redirected.signals.every((signal) => signal.aborted)).toBe(true);
});

// regression: provider metadata followed redirects inside fetch, past the private-network check.
test("video provider metadata follows redirects one checked hop at a time", async () => {
  const oEmbed = '{"title":"A moved video","author_name":"Someone"}';
  const followed = stubFetch(
    () => html("", { status: 301, headers: { location: "https://www.youtube.com/oembed?moved" } }),
    () => new Response(oEmbed, { headers: { "content-type": "application/json" } }),
  );
  const result = await ingestUrl("https://www.youtube.com/watch?v=abc12345678", {
    fetch: followed.fetch,
    lookupHost,
  });
  expect(result.title).toBe("A moved video");
  expect(followed.requested[1]).toBe("https://www.youtube.com/oembed?moved");

  const toPrivate = stubFetch(
    () => html("", { status: 302, headers: { location: "https://127.0.0.1.nip.io/oembed" } }),
    () => new Response(oEmbed, { headers: { "content-type": "application/json" } }),
  );
  const refused = await ingestUrl("https://www.youtube.com/watch?v=abc12345678", {
    fetch: toPrivate.fetch,
    lookupHost,
  });
  expect(refused.title).toBe("YouTube video");
  expect(toPrivate.requested).toHaveLength(1);
});

// regression: a page whose body could not be extracted lost the title, summary and images it had.
test("a page with no readable body keeps its title, description, author and images", async () => {
  const { fetch } = stubFetch(() =>
    html(`<html><head><title>Gallery</title>
      <meta name="description" content="Photos from the coast">
      <meta name="author" content="Ada">
      <meta property="og:image" content="https://example.com/cover.jpg">
    </head><body><div id="app"></div></body></html>`),
  );
  const result = await ingestUrl("https://example.com/gallery", { fetch, lookupHost });
  expect(result).toMatchObject({
    title: "Gallery",
    description: "Photos from the coast",
    author: "Ada",
    html: "",
    text: "",
  });
  expect(result.imageUrls).toContain("https://example.com/cover.jpg");
});

// regression: a link straight to an image or PDF failed its job for good.
test("a link straight to a file is kept, titled by its file name, without reading the file", async () => {
  const image = stubFetch(
    () => new Response("binary", { headers: { "content-type": "image/jpeg" } }),
  );
  const saved = await ingestUrl("https://example.com/photos/sea%20view.jpg", {
    fetch: image.fetch,
    lookupHost,
  });
  expect(saved).toMatchObject({
    title: "sea view.jpg",
    html: "",
    imageUrls: ["https://example.com/photos/sea%20view.jpg"],
  });
  expect(image.signals.every((signal) => signal.aborted)).toBe(true);

  const pdf = stubFetch(
    () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
  );
  const document = await ingestUrl("https://example.com/", { fetch: pdf.fetch, lookupHost });
  expect(document).toMatchObject({ title: "example.com", imageUrls: [] });
});
