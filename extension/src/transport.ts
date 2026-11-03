import type { CapturePayloadV1 } from "@inkling/contracts/capture";

export class CaptureResponseError extends Error {
  constructor(readonly status: number) {
    super(`loopback capture failed: HTTP ${status}`);
    this.name = "CaptureResponseError";
  }
}

/** The `inkling://capture` link for a capture; apps/desktop/src/capture/deep-link.ts parses it. */
export function buildCaptureDeepLink(payload: CapturePayloadV1) {
  const params = new URLSearchParams({ url: payload.url });
  if (payload.kind === "page") params.set("title", payload.title);
  if (payload.kind === "quote") {
    params.set("title", payload.attribution);
    params.set("selection", payload.selection);
  }
  if (payload.kind === "image") {
    params.set("image", payload.imageUrl);
    params.set("alt", payload.alt);
  }
  params.set("via", "extension");
  return `inkling://capture?${params.toString()}`;
}

export async function postPayloadToLoopback(
  baseUrl: string,
  token: string,
  payload: CapturePayloadV1,
) {
  const response = await fetch(`${baseUrl}/v1/captures`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new CaptureResponseError(response.status);
}

/** How the paired app answers now; it picks a new port each time it starts. The popup waits on it. */
export async function loopbackHealth(baseUrl: string, token: string) {
  try {
    const response = await fetch(`${baseUrl}/v1/health`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(500),
    });
    if (response.ok) return "connected";
    return response.status === 401 ? "refused" : "silent";
  } catch {
    return "silent";
  }
}
