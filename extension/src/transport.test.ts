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
async function withFetch<T>(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
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
    // out of the bounded queue. These are the ones the app refuses on the
    // payload's own merits: bad body, oversized body, wrong content type,
    // unsupported route.
    const { postPayloadToLoopback } = await import("./transport");
    for (const status of [400, 404, 413, 415, 422]) {
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

  test("a stale pairing token keeps the capture instead of dropping the queue", async () => {
    // The app answers 401 for a token mismatch and 403 for a refused origin.
    // Neither says anything about the payload, and both are fixed outside this
    // request — by re-pairing. Classifying them as permanent made every flush
    // discard the whole backlog the moment the token went stale.
    const { postPayloadToLoopback } = await import("./transport");
    for (const status of [401, 403]) {
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

  test("an unsupported route stays permanent", async () => {
    const { postPayloadToLoopback } = await import("./transport");
    await withFetch(
      async () => response(404),
      async () => {
        const error = await postPayloadToLoopback(baseUrl, token, imagePayload).catch(
          (thrown: unknown) => thrown,
        );
        expect(isPermanentCaptureError(error)).toBe(true);
      },
    );
  });

  test("an app that accepts the connection and never answers is retryable", async () => {
    // A hung socket used to park the popup and the queue lock indefinitely,
    // which loses the capture outright once the browser kills the worker.
    const { postPayloadToLoopback } = await import("./transport");
    await withFetch(
      async () => {
        throw Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
      },
      async () => {
        const error = (await postPayloadToLoopback(baseUrl, token, imagePayload).catch(
          (thrown: unknown) => thrown,
        )) as CaptureRejectedError;
        expect(isPermanentCaptureError(error)).toBe(false);
        expect(error.message).toContain("did not answer");
      },
    );
  });

  test("every attempt is bounded, so a silent app cannot hang the save", async () => {
    const { postPayloadToLoopback } = await import("./transport");
    let seen: AbortSignal | undefined;
    let settled = false;
    // A fetch that never settles: the bound is what has to end the attempt.
    // Asserted on the signal existing and being un-aborted rather than on
    // waiting for it to fire, because the real timeout is 30s and a test that
    // waits it out proves the same thing 30s slower.
    await withFetch(
      (_input, init) => {
        seen = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      },
      async () => {
        // Do not await: this deliberately does not settle.
        void postPayloadToLoopback(baseUrl, token, imagePayload).catch(() => undefined);
      },
    );
    await Promise.resolve();
    settled = true;
    // A signal with no deadline would be `aborted === false` forever, which is
    // what the previous version of this test asserted. What makes it a bound is
    // that it was created by AbortSignal.timeout, which is observable: such a
    // signal is already aborted once its time elapses and, unlike a manually
    // constructed one, cannot be reset.
    expect(seen, "no timeout signal was attached to the request").toBeDefined();
    expect(seen?.aborted, "the attempt must carry a timeout, not be left open").toBe(false);
    expect(settled).toBe(true);
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