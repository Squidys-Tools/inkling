import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";
import type { ExtensionCapturePayload } from "./payload";

type LoopbackCapturePayload = PageCapturePayloadV1 | ExtensionCapturePayload;

export async function postPayloadToLoopback(
  baseUrl: string,
  token: string,
  payload: LoopbackCapturePayload,
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
