// Capture payloads sent by the browser extension (producer) and consumed by the
// inkling app. Field names are the contract: both sides import these types, so
// a rename here breaks both at compile time.

export const EXTENSION_SELECTION_TEXT_MAX_CHARS = 1500;
export const EXTENSION_ATTRIBUTION_MAX_CHARS = 240;
export const EXTENSION_IMAGE_DATA_URL_MAX_BYTES = 5 * 1024 * 1024;

// A highlighted passage. selectedHtml is untrusted and must always go through
// the app's sanitizeHtml before storage or render; selectedText is the plain
// fallback when the selection has no readable markup.
export type ExtensionSelectionPayload = {
  kind: "selection";
  sourceUrl: string;
  selectedHtml: string;
  selectedText: string;
  title?: string;
};

// Right-click "Save image to inkling". The app downloads srcUrl itself through
// the existing asset pipeline. dataUrl is only for blob:/canvas sources the
// app cannot fetch, and is capped by EXTENSION_IMAGE_DATA_URL_MAX_BYTES.
export type ExtensionImagePayload = {
  kind: "image";
  pageUrl: string;
  srcUrl: string;
  alt?: string;
  dataUrl?: string;
};

// A video page itself (YouTube/Vimeo watch URL). Pass-through: the app routes
// it through the existing video-links.ts path, same as pasting the URL.
export type ExtensionVideoPayload = {
  kind: "video";
  sourceUrl: string;
};

export type ExtensionCapturePayload =
  | ExtensionSelectionPayload
  | ExtensionImagePayload
  | ExtensionVideoPayload;
