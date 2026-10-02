import { describe, expect, test } from "bun:test";
import { CaptureRejectedError, isPermanentCaptureError } from "./transport";

function response(status: number, body?: unknown): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body ?? {},
  } as unknown as Response;
}

/** Install a fetch stub for one assertion and restore the real one after. */
async function withFetch<T>(impl: () => Promise<Response>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl as unknown as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const baseUrl = "http://127.0.0.1:1234";
const token = "test-token";
const imagePayload = {
  kind: "image",
  pageUrl: "https://example.com/gallery",
  srcUrl: "https://cdn.example.com/photo.jpg",
} as const;

describe("capture rejection classification", () => {
  test("a 4xx from the app is permanent", async () => {
    // Regression: these were queued as though delivery were merely delayed, so
    // every flush retried them, held the queue lock, and pushed older captures
    // out of the bounded queue.
    const { postPayloadToLoopback } = await import("./transport");
    for (const status of [400, 401, 404, 422]) {
      await withFetch(
        async () => response(status),
        async () => {
          const error = await postPayloadToLoopback(baseUrl, token, imagePayload).catch(
            (thrown: unknown) => thrown,
          );
          expect(isPermanentCaptureError(error)).toBe(true);
        },
      );
    }
  });

  test("a refused image download (502) is permanent", async () => {
    // The exact case the finding describes: the app answers 502 when the image
    // host returns non-image content. Nothing about a retry changes that, so
    // the capture must not sit in the queue.
    const { postPayloadToLoopback } = await import("./transport");
    await withFetch(
      async () => response(502),
      async () => {
        const error = await postPayloadToLoopback(baseUrl, token, imagePayload).catch(
          (thrown: unknown) => thrown,
        );
        expect(isPermanentCaptureError(error)).toBe(true);
      },
    );
  });

  test("timeouts, rate limits, and not-ready storage stay retryable", async () => {
    const { postPayloadToLoopback } = await import("./transport");
    for (const status of [408, 429, 500, 503]) {
      await withFetch(
        async () => response(status),
        async () => {
          const error = await postPayloadToLoopback(baseUrl, token, imagePayload).catch(
            (thrown: unknown) => thrown,
          );
          expect(isPermanentCaptureError(error)).toBe(false);
        },
      );
    }
  });

  test("an unreachable app is retryable, not permanent", async () => {
    const { postPayloadToLoopback } = await import("./transport");
    await withFetch(
      async () => {
        throw new Error("Failed to fetch");
      },
      async () => {
        const error = await postPayloadToLoopback(baseUrl, token, imagePayload).catch(
          (thrown: unknown) => thrown,
        );
        expect(isPermanentCaptureError(error)).toBe(false);
        expect((error as Error).message).toContain("Failed to fetch");
      },
    );
  });

  test("a plain error is not treated as permanent", () => {
    expect(isPermanentCaptureError(new Error("boom"))).toBe(false);
    expect(isPermanentCaptureError(undefined)).toBe(false);
  });

  test("the reason the app gave survives on the error", async () => {
    const { postPayloadToLoopback } = await import("./transport");
    await withFetch(
      async () => response(502, { message: "invalid-image: Response is not an image." }),
      async () => {
        const error = (await postPayloadToLoopback(baseUrl, token, imagePayload).catch(
          (thrown: unknown) => thrown,
        )) as CaptureRejectedError;
        expect(error.message).toContain("invalid-image");
        expect(isPermanentCaptureError(error)).toBe(true);
      },
    );
  });
});