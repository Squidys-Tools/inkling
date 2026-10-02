import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";
import type { ExtensionCapturePayload } from "./payload";

type LoopbackCapturePayload = PageCapturePayloadV1 | ExtensionCapturePayload;

/**
 * A capture the app refused on its merits, as opposed to one it could not
 * accept right now. A permanent rejection is the same every time it is
 * retried: a malformed payload, or an image host that answered with something
 * other than an image. Retrying it only fills the pending queue and pushes out
 * captures that would have succeeded.
 *
 * The app distinguishes them by status: 4xx (except the retryable 408/429) is
 * the app saying no, 5xx and transport failures are the app saying not now.
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
 * - 4xx (except 408/429) means the app refused the capture — malformed
 *   payload, wrong token, unsupported route.
 * - 502 means the image host answered with something that is not an image, or
 *   refused it. That answer will be identical on every retry, so it is as
 *   permanent as a 4xx despite being a 5xx.
 * - 503 means storage is not ready yet, and 408/429 mean "later". Those are
 *   worth retrying.
 */
function isPermanentStatus(status: number): boolean {
  if (status === 408 || status === 429) return false;
  if (status === 502) return true;
  if (status === 503) return false;
  return status >= 400 && status < 500;
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
    });
  } catch (error) {
    // No answer at all: the app is closed or unreachable. Worth retrying.
    throw new CaptureRejectedError(
      error instanceof Error ? error.message : "could not reach the app",
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