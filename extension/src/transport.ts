import type { PageCapturePayloadV1 } from "@inkling/contracts/capture";

export class CaptureResponseError extends Error {
  constructor(readonly status: number) {
    super(`loopback capture failed: HTTP ${status}`);
    this.name = "CaptureResponseError";
  }
}

export function buildCaptureDeepLink(payload: Pick<PageCapturePayloadV1, "url" | "title">) {
  const params = new URLSearchParams({
    url: payload.url,
    title: payload.title,
    via: "extension",
  });
  return `inkling://capture?${params.toString()}`;
}

export async function postPayloadToLoopback(
  baseUrl: string,
  token: string,
  payload: PageCapturePayloadV1,
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
