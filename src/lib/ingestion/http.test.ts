import { expect, test } from "bun:test";
import { isUrlIngestionError } from "./errors";
import { ingestUrl } from "./url-ingestion";

const article = `<html><head><title>Saved page</title></head><body><article>
  <h1>Saved page</h1><p>${"A paragraph worth keeping for later reading. ".repeat(20)}</p>
</article></body></html>`;

function stubFetch(...responses: (() => Response)[]) {
  const requested: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    requested.push(String(url));
    const next = responses[Math.min(requested.length, responses.length) - 1];
    return next();
  }) as typeof globalThis.fetch;
  return { fetch, requested };
}

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
  const result = await ingestUrl("https://example.com/post", { fetch });
  expect(result.title).toBe("Saved page");
  expect(requested).toEqual(["https://example.com/post", "https://example.com/post"]);
});

test("a Retry-After longer than the time budget fails as a timeout instead of retrying early", async () => {
  const { fetch, requested } = stubFetch(() =>
    html("slow down", { status: 429, headers: { "retry-after": "120" } }),
  );
  const error = await ingestionError(
    ingestUrl("https://example.com/post", { fetch, timeoutMs: 50 }),
  );
  expect(error.code).toBe("timeout");
  expect(requested).toHaveLength(1);
});

test("a missing page fails on the first answer without retrying", async () => {
  const { fetch, requested } = stubFetch(() => html("gone", { status: 404 }));
  const error = await ingestionError(ingestUrl("https://example.com/post", { fetch }));
  expect(error).toMatchObject({ code: "http-error", details: { status: 404 } });
  expect(requested).toHaveLength(1);
});

test("a page past the byte limit is refused while it streams", async () => {
  const { fetch } = stubFetch(() => html(article));
  const error = await ingestionError(
    ingestUrl("https://example.com/post", { fetch, maxResponseBytes: 64 }),
  );
  expect(error.code).toBe("content-too-large");
});

test("a failing video provider leaves the link indexed with its plain label", async () => {
  const { fetch, requested } = stubFetch(() => {
    throw new TypeError("network down");
  });
  const result = await ingestUrl("https://www.youtube.com/watch?v=abc12345678", { fetch });
  expect(result.title).toBe("YouTube video");
  expect(result.safeEmbeds).toHaveLength(1);
  // A dropped connection counts as transient, so it was tried three times.
  expect(requested).toHaveLength(3);
});
