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
type ExtensionSelectionPayload = {
  kind: "selection";
  sourceUrl: string;
  selectedHtml: string;
  selectedText: string;
  title?: string;
};

// Right-click "Save image to inkling". The app downloads srcUrl itself through
// the existing asset pipeline. dataUrl is only for blob:/canvas sources the
// app cannot fetch, and is capped (see EXTENSION_IMAGE_DATA_URL_MAX_BYTES in
// src/lib/ingestion/extension-capture.ts).
type ExtensionImagePayload = {
  kind: "image";
  pageUrl: string;
  srcUrl: string;
  alt?: string;
  dataUrl?: string;
};

// A video page itself (YouTube/Vimeo watch URL). Pass-through: the app routes
// it through the existing video-links.ts path, same as pasting the URL.
type ExtensionVideoPayload = {
  kind: "video";
  sourceUrl: string;
};

export type ExtensionCapturePayload =
  | ExtensionSelectionPayload
  | ExtensionImagePayload
  | ExtensionVideoPayload;

function isHttpUrlString(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
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
//   // background validates with isCaptureMessage, then opens
//   // payloadToDeepLink(payload) so capture works even when the app is cold.
