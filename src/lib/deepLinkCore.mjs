import { tryParseHttpUrl } from "./ingestion/url.ts";

export { parseDeepLinkCapture as parseDeepLinkCaptureCore } from "./deepLink.ts";

export function parseHttpUrlCore(value) {
  return tryParseHttpUrl(value, { allowPrivateNetwork: true });
}
