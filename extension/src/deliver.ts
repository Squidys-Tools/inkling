import type { CapturePayloadV1 } from "@inkling/contracts/capture";
import { tryParseHttpUrl } from "@inkling/ingestion/url";
import browser from "webextension-polyfill";
import {
  BASE_URL_KEY,
  isPairingToken,
  normalizeCaptureServerAddress,
  TOKEN_KEY,
} from "./connection";
import { CaptureResponseError, buildCaptureDeepLink, postPayloadToLoopback } from "./transport";

export async function readLoopbackConfig() {
  const stored = await browser.storage.local.get([BASE_URL_KEY, TOKEN_KEY]);
  const baseUrl = normalizeCaptureServerAddress(stored[BASE_URL_KEY]);
  const token = stored[TOKEN_KEY];
  if (!baseUrl || !isPairingToken(token)) return null;
  return { baseUrl, token };
}

function captureErrorMessage(status: number) {
  if (status === 422) return "inkling can't save this address";
  return `inkling returned HTTP ${status}`;
}

const isPrivate = (url: string) => url !== "" && !tryParseHttpUrl(url);

// Windows hands an external-protocol link to the app only up to this length.
const maxWindowsLinkLength = 2048;

/**
 * Sends a capture to the paired app, or through the `inkling://` link when the
 * extension is not paired or the app does not answer. "saved" means the app
 * stored it; "sent" means the link went out and the app saves it on arrival.
 */
export async function deliver(payload: CapturePayloadV1) {
  const config = await readLoopbackConfig().catch(() => null);
  if (config) {
    try {
      await postPayloadToLoopback(config.baseUrl, config.token, payload);
      return "saved" as const;
    } catch (error) {
      // A stale token or the rate limit does not bind the link; any other refusal would.
      if (error instanceof CaptureResponseError && error.status !== 401 && error.status !== 429)
        throw new Error(captureErrorMessage(error.status), { cause: error });
    }
  }
  // The app drops a link to an address on the user's own network (apps/desktop/src/capture/web-url.ts).
  if ([payload.url, payload.kind === "image" ? payload.imageUrl : ""].some(isPrivate))
    throw new Error("pair the extension with inkling to save from your own network");
  const link = buildCaptureDeepLink(payload);
  if (link.length > maxWindowsLinkLength && navigator.userAgent.includes("Windows"))
    throw new Error("pair the extension with inkling to save something this long");
  try {
    await browser.tabs.create({ url: link });
  } catch {
    throw new Error("open inkling once, then try again");
  }
  return "sent" as const;
}
