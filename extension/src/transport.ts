import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";
import type { ExtensionCapturePayload } from "./payload";

type LoopbackCapturePayload = PageCapturePayloadV1 | ExtensionCapturePayload;

/**
 * A capture the app refused on its merits, as opposed to one it could not
 * accept right now. `permanent` says which: see isPermanentStatus for the app's
 * own vocabulary. Retrying a permanent rejection only fills the pending queue
 * and pushes out captures that would have succeeded.
 */
export class CaptureRejectedError extends Error {
  readonly permanent: boolean;

  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = "CaptureRejectedError";
    this.permanent = permanent;
  }
}

/**
 * The app's own vocabulary, not a generic rule:
 * - 4xx means the app refused the capture *on the payload's own merits* —
 *   malformed body, oversized body, wrong content type, unsupported route.
 *   Retrying it produces the same answer, so it is dropped rather than queued.
 * - 401 and 403 are the app saying the *caller* is not welcome yet: a pairing
 *   token the user has not refreshed, or an origin policy the app has since
 *   changed. Nothing about the capture is wrong, and re-pairing is a thing the
 *   user does. Queuing is exactly right — dropping the backlog here would
 *   destroy every capture taken while the app was closed, over a token the
 *   user can fix in five seconds.
 * - 502 means the image host answered with something that is not an image, or
 *   refused it. That answer will be identical on every retry, so it is as
 *   permanent as a 4xx despite being a 5xx.
 * - 503 means storage is not ready yet, and 408/429 mean "later". Those are
 *   worth retrying.
 */
function isPermanentStatus(status: number): boolean {
  if (status === 401 || status === 403 || status === 408 || status === 429 || status === 503) return false;
  if (status === 502) return true;
  return status >= 400 && status < 500;
}

/**
 * Bound on one capture POST. The popup waits on this, and so does every queued
 * capture during a flush, so a socket that accepts and never answers must not
 * park either. The app bounds its own socket at 10s and its image download at
 * 10s, so anything past this is a connection that will never produce a verdict.
 *
 * Delivery is at-least-once: a capture the app stored but whose response was
 * lost gets stored again on the retry. That window already exists for any
 * transport failure after the app commits. A timeout widens it slightly and
 * still beats losing the user's capture outright.
 */
const CAPTURE_TIMEOUT_MS = 30_000;

function isTimeout(error: unknown): boolean {
  // AbortSignal.timeout rejects with a DOMException, which is not an Error
  // instance, so match on the name instead.
  return (
    typeof error === "object" && error !== null && (error as { name?: unknown }).name === "TimeoutError"
  );
}

export async function postPayloadToLoopback(
  baseUrl: string,
  token: string,
  payload: LoopbackCapturePayload,
): Promise<void> {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/captures`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),

    });
  } catch (error) {
    // No verdict at all: the app is closed, unreachable, or not answering.
    // Worth retrying.
    throw new CaptureRejectedError(
      isTimeout(error)
        ? `the app did not answer within ${CAPTURE_TIMEOUT_MS / 1000}s`
        : error instanceof Error
          ? error.message
          : "could not reach the app",
      false,
    );
  }
  if (!response.ok) {
    // The app answers a rejected capture with { error, message }. The status
    // alone cannot tell "the image host refused it" from "storage is down", so
    // surface the reason the app actually gave.
    const reason = await response
      .json()
      .then((body: { message?: unknown }) =>
        typeof body?.message === "string" ? `: ${body.message}` : "",
      )
      .catch(() => "");
    throw new CaptureRejectedError(
      `loopback capture failed: HTTP ${response.status}${reason}`,
      isPermanentStatus(response.status),
    );
  }
}

/** True when retrying the same payload cannot change the outcome. */
export function isPermanentCaptureError(error: unknown): boolean {
  return error instanceof CaptureRejectedError && error.permanent;
}