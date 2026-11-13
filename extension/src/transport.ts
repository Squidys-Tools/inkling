import type { CapturePayloadV1 } from "@inkling/contracts/capture";
import { isPairingToken, receiverUrl } from "./connection";

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

async function loopbackHealth(baseUrl: string, token: string) {
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

/**
 * Finds the paired app among its ports. Another inkling, a development build beside the
 * installed one, refuses this token, so the search goes on past a refusal.
 */
export async function findReceiver(ports: readonly number[], token: string) {
  let refused = false;
  for (const port of ports) {
    const health = await loopbackHealth(receiverUrl(port), token);
    if (health === "connected") return { state: "connected" as const, port };
    refused ||= health === "refused";
  }
  return { state: refused ? ("refused" as const) : ("silent" as const) };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Asks the first inkling that answers to pair. The user approves in the app; `pairingAnswer` reads it. */
export async function requestPairing(ports: readonly number[]) {
  for (const port of ports) {
    try {
      const response = await fetch(`${receiverUrl(port)}/v1/pair`, {
        method: "POST",
        signal: AbortSignal.timeout(2_000),
      });
      const body: unknown = await response.json();
      if (!isRecord(body) || response.status !== 202) continue;
      if (body.app === "inkling" && typeof body.id === "string") return { port, id: body.id };
    } catch {}
  }
  return null;
}

export async function pairingAnswer(port: number, id: string) {
  try {
    const response = await fetch(`${receiverUrl(port)}/v1/pair/${id}`, {
      signal: AbortSignal.timeout(2_000),
    });
    const body: unknown = await response.json();
    if (!response.ok || !isRecord(body)) return { status: "denied" as const };
    if (body.status === "pending") return { status: "pending" as const };
    if (body.status === "approved" && isPairingToken(body.token))
      return { status: "approved" as const, token: body.token };
    return { status: "denied" as const };
  } catch {
    return { status: "denied" as const };
  }
}
