import type { CapturePayloadV1 } from "@inkling/contracts/capture";
import { tryParseHttpUrl } from "@inkling/ingestion/url";
import browser from "webextension-polyfill";
import { isPairingToken, PORT_KEY, portsToTry, receiverUrl, TOKEN_KEY } from "./connection";
import {
  CaptureResponseError,
  buildCaptureDeepLink,
  findReceiver,
  postPayloadToLoopback,
} from "./transport";

/** Where the paired app is listening now, or why it cannot be reached. */
export async function locateReceiver() {
  const stored = await browser.storage.local.get([TOKEN_KEY, PORT_KEY]);
  const token = stored[TOKEN_KEY];
  if (!isPairingToken(token)) return { state: "unpaired" as const };
  const found = await findReceiver(portsToTry(stored[PORT_KEY]), token);
  if (found.state !== "connected") return found;
  if (found.port !== stored[PORT_KEY]) await browser.storage.local.set({ [PORT_KEY]: found.port });
  return { ...found, token };
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
 * extension is not connected or the app does not answer. "saved" means the app
 * stored it; "sent" means the link went out and the app saves it on arrival.
 */
export async function deliver(payload: CapturePayloadV1) {
  const receiver = await locateReceiver().catch(() => null);
  if (receiver?.state === "connected") {
    try {
      await postPayloadToLoopback(receiverUrl(receiver.port), receiver.token, payload);
      return "saved" as const;
    } catch (error) {
      // A stale token or the rate limit does not bind the link; any other refusal would.
      if (error instanceof CaptureResponseError && error.status !== 401 && error.status !== 429)
        throw new Error(captureErrorMessage(error.status), { cause: error });
    }
  }
  // The app drops a link to an address on the user's own network (apps/desktop/src/capture/web-url.ts).
  if ([payload.url, payload.kind === "image" ? payload.imageUrl : ""].some(isPrivate))
    throw new Error("open inkling and connect the extension to save from your own network");
  const link = buildCaptureDeepLink(payload);
  if (link.length > maxWindowsLinkLength && navigator.userAgent.includes("Windows"))
    throw new Error("open inkling and connect the extension to save something this long");
  try {
    await browser.tabs.create({ url: link });
  } catch {
    throw new Error("open inkling once, then try again");
  }
  return "sent" as const;
}
