// TODO(phase1): move to packages/ingestion-shared.
// Canonical v1 capture payloads for the inkling browser extension.
//
// This file is intentionally dependency-free (no DOM, no chrome APIs) so the
// content script, popup, and background worker can share it without a build
// step. If Phase 1 lands packages/ingestion-shared, move these types there
// verbatim: field names are the contract, so reconciliation must stay
// mechanical — copy, don't rename.

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
// app cannot fetch, and is capped (see EXTENSION_IMAGE_DATA_URL_MAX_BYTES).
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

// Mirrors the backend create_quote limits (storage.rs) and the deep-link
// parser so extension captures never fail validation downstream.
export const EXTENSION_SELECTION_TEXT_MAX_CHARS = 1500;
export const EXTENSION_ATTRIBUTION_MAX_CHARS = 240;
// Raw selection markup is capped before it leaves the page so capture stays
// instant even on huge highlights; the app truncates the readable text again.
export const EXTENSION_SELECTION_HTML_MAX_CHARS = 20_000;
// Blob/canvas fallback only: larger images must come through srcUrl download.
export const EXTENSION_IMAGE_DATA_URL_MAX_BYTES = 5 * 1024 * 1024;

export function isHttpUrlString(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function cleanText(value: string | null | undefined, maxChars: number): string {
  return (value ?? "").replace(/\s+/gu, " ").trim().slice(0, maxChars);
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

// Extension-local copy of the YouTube/Vimeo allowlist. Must stay consistent
// with src/lib/ingestion/safe-embeds.ts: only pages the app can embed become
// video payloads; everything else travels as a normal URL capture.
const VIDEO_PAGE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
]);

export function isVideoPageUrl(value: string | null | undefined): boolean {
  if (!isHttpUrlString(value)) return false;
  try {
    return VIDEO_PAGE_HOSTS.has(new URL(value!.trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Highlight → quote payload. Returns null when there is nothing quotable. */
export function buildSelectionPayload(input: {
  sourceUrl: string;
  selectedText: string;
  selectedHtml?: string;
  title?: string;
}): ExtensionSelectionPayload | null {
  if (!isHttpUrlString(input.sourceUrl)) return null;
  const selectedText = cleanText(input.selectedText, EXTENSION_SELECTION_TEXT_MAX_CHARS);
  const selectedHtml = (input.selectedHtml ?? "").slice(0, EXTENSION_SELECTION_HTML_MAX_CHARS);
  if (!selectedText && !selectedHtml.trim()) return null;
  const title = cleanText(input.title, EXTENSION_ATTRIBUTION_MAX_CHARS);
  return {
    kind: "selection",
    sourceUrl: input.sourceUrl.trim(),
    selectedHtml,
    // Keep the text even when markup exists: it is the readable body the app
    // stores when sanitizing drops everything (e.g. a highlighted image).
    selectedText,
    ...(title ? { title } : {}),
  };
}

/** Right-click image → image payload. Prefers srcUrl download; dataUrl is fallback. */
export function buildImagePayload(input: {
  pageUrl: string;
  srcUrl: string;
  alt?: string;
  dataUrl?: string;
}): ExtensionImagePayload | null {
  if (!isHttpUrlString(input.pageUrl)) return null;
  const srcUrl = input.srcUrl.trim();
  const dataUrl = input.dataUrl?.trim() ?? "";
  // http(s) sources download through the app pipeline. blob:/data: sources
  // need a dataUrl fallback because the app cannot fetch them.
  const downloadable = isHttpUrlString(srcUrl);
  const hasFallback = dataUrl.startsWith("data:image/");
  if (!downloadable && !hasFallback) return null;
  if (!downloadable && !srcUrl) return null;
  const alt = cleanText(input.alt, 240);
  return {
    kind: "image",
    pageUrl: input.pageUrl.trim(),
    srcUrl,
    ...(alt ? { alt } : {}),
    ...(hasFallback ? { dataUrl } : {}),
  };
}

/** Video page → video payload. Only YouTube/Vimeo pass through; else null. */
export function buildVideoPayload(sourceUrl: string): ExtensionVideoPayload | null {
  if (!isVideoPageUrl(sourceUrl)) return null;
  return { kind: "video", sourceUrl: sourceUrl.trim() };
}

// Deep-link encoders. The app already handles url-only links (article/video)
// and url+title+selection links (quote). dataUrl never travels by deep link:
// it is too large for a URL and goes through the local companion POST path.
export function payloadToDeepLink(payload: ExtensionCapturePayload): string | null {
  if (payload.kind === "selection") {
    const params = new URLSearchParams({
      url: payload.sourceUrl,
      ...(payload.title ? { title: payload.title } : {}),
      selection: payload.selectedText || payload.selectedHtml,
    });
    return `inkling://capture?${params.toString()}`;
  }
  if (payload.kind === "video") {
    return `inkling://capture?url=${encodeURIComponent(payload.sourceUrl)}`;
  }
  if (!isHttpUrlString(payload.srcUrl)) return null;
  const params = new URLSearchParams({ url: payload.pageUrl, image: payload.srcUrl });
  if (payload.alt) params.set("alt", payload.alt);
  return `inkling://capture?${params.toString()}`;
}

// Background/popup wiring (pure data + router; the service worker owns the
// chrome.* calls). Keep these ids stable: menus persist across updates.
export const INKLING_MENU_SAVE_SELECTION = "inkling-save-selection";
export const INKLING_MENU_SAVE_IMAGE = "inkling-save-image";
export const INKLING_MENU_SAVE_VIDEO = "inkling-save-video";

export type ExtensionCaptureMessage = {
  type: "inkling/capture";
  payload: ExtensionCapturePayload;
};

export function isCaptureMessage(value: unknown): value is ExtensionCaptureMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.type !== "inkling/capture" || !record.payload || typeof record.payload !== "object") return false;
  return (["selection", "image", "video"] as string[]).includes(
    (record.payload as Record<string, unknown>).kind as string,
  );
}

// Thin wiring the background worker applies (mechanical; no logic here):
//   chrome.contextMenus.create({ id: INKLING_MENU_SAVE_SELECTION, title: "Save selection as quote", contexts: ["selection"] });
//   chrome.contextMenus.create({ id: INKLING_MENU_SAVE_IMAGE, title: "Save image to inkling", contexts: ["image"] });
//   // onClicked → tabs.sendMessage(tab.id, { type: "inkling/collect", menuItemId }) ;
//   // content.js collects and replies with { type: "inkling/capture", payload };
//   // background validates with isCaptureMessage + builders above, then opens
//   // payloadToDeepLink(payload) so capture works even when the app is cold.
