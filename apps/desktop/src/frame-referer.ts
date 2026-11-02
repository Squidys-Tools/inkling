import { FRAME_ORIGINS } from "@inkling/ingestion/frame-origins";

// Frame origins that refuse a request they cannot identify by Referer: YouTube
// answers error 153. The app page's `app://local` origin is not an http(s)
// referrer Chromium can send, so the app's site stands in as the embedder.
const EMBEDDER_REFERER = "https://getinkling.dev/";
const REFERER_ORIGINS = [FRAME_ORIGINS.youtube];

/** The Referer to stamp on a player request, or null when its own already works. */
export function frameReferer(url: string, referrer: string | undefined): string | null {
  if (referrer?.startsWith("http://") || referrer?.startsWith("https://")) return null;
  return REFERER_ORIGINS.some((origin) => url.startsWith(`${origin}/`)) ? EMBEDDER_REFERER : null;
}

export function registerFrameReferer(webRequest: Electron.WebRequest) {
  webRequest.onBeforeSendHeaders(
    { urls: REFERER_ORIGINS.map((origin) => `${origin}/*`) },
    (details, callback) => {
      const referer = frameReferer(details.url, details.referrer);
      if (referer) details.requestHeaders.Referer = referer;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}
