import type { CapturePayloadV1 } from "@inkling/contracts/capture";
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
  if (status === 401) return "check the extension pairing in inkling Settings → Browser extension";
  if (status === 429) return "too many saves; try again in a minute";
  return `inkling returned HTTP ${status}`;
}

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
      // The app answered and refused, so the link would be refused too.
      if (error instanceof CaptureResponseError)
        throw new Error(captureErrorMessage(error.status), { cause: error });
    }
  }
  try {
    await browser.tabs.create({ url: buildCaptureDeepLink(payload) });
  } catch {
    throw new Error("open inkling once, then try again");
  }
  return "sent" as const;
}
