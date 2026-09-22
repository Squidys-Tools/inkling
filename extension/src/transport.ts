import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

// Phase 1 transport: the app is reached through its deep link
// (inkling://capture?url=…), which proves end-to-end delivery before the
// loopback server lands. The v1 payload itself is transport-agnostic — Phase 2
// swaps the body below from "deep link + queued payload" to "POST the same
// payload" without changing the schema. See postPayloadToLoopback.

// The app re-sanitizes everything on receipt (see packages/ingestion-shared),
// so the deep link carries only URL + title: small, auditable, and never a
// vector for smuggling markup through a URL handler. The provenance marker is
// `via`, NOT `source` — the app's deep-link parser reads `source` as a legacy
// alias for the target URL, so reusing that name would corrupt parsing.
const CAPTURE_VIA = "extension" as const;

export function buildCaptureDeepLink(
  payload: Pick<PageCapturePayloadV1, "url" | "title">,
): string {
  const params = new URLSearchParams({
    url: payload.url,
    title: payload.title,
    via: CAPTURE_VIA,
  });
  return `inkling://capture?${params.toString()}`;
}

/**
 * Phase 2 swap point. POSTs the unchanged v1 payload to the app's loopback
 * capture endpoint (`POST {baseUrl}/v1/captures`, per-install bearer token via
 * `Authorization: Bearer …`). NOT wired up in Phase 1 — `baseUrl` and `token`
 * are deliberately parameters, resolved from app discovery at call time and
 * never baked in (the app binds 127.0.0.1 on an ephemeral port), so the call
 * site stays identical when the swap lands.
 */
export async function postPayloadToLoopback(
  baseUrl: string,
  token: string,
  payload: PageCapturePayloadV1,
): Promise<void> {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/captures`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`loopback capture failed: HTTP ${response.status}`);
  }
}
