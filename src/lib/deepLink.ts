import {
  DEEP_LINK_ATTRIBUTION_MAX_LENGTH,
  DEEP_LINK_SELECTION_MAX_LENGTH,
  parseDeepLinkCaptureCore,
} from "./deepLinkCore.mjs";
import type { DeepLinkCapture } from "./deepLinkCore.mjs";
import { parseHttpUrl } from "./ingestion/url";

export { DEEP_LINK_ATTRIBUTION_MAX_LENGTH, DEEP_LINK_SELECTION_MAX_LENGTH };
export type { DeepLinkCapture } from "./deepLinkCore.mjs";

export function validateDeepLinkCapture(value: unknown): DeepLinkCapture | null {
  if (!value || typeof value !== "object") return null;

  const capture = value as Record<string, unknown>;
  try {
    if (capture.kind === "url" && typeof capture.url === "string") {
      return { kind: "url", url: parseHttpUrl(capture.url).toString() };
    }
    if (
      capture.kind === "quote" &&
      typeof capture.url === "string" &&
      typeof capture.selection === "string" &&
      typeof capture.attribution === "string"
    ) {
      const selection = capture.selection.trim().slice(0, DEEP_LINK_SELECTION_MAX_LENGTH);
      if (!selection) return null;
      return {
        kind: "quote",
        url: parseHttpUrl(capture.url).toString(),
        selection,
        attribution: capture.attribution.trim().slice(0, DEEP_LINK_ATTRIBUTION_MAX_LENGTH),
      };
    }
    if (
      capture.kind === "image" &&
      typeof capture.pageUrl === "string" &&
      typeof capture.imageUrl === "string" &&
      typeof capture.alt === "string"
    ) {
      return {
        kind: "image",
        pageUrl: parseHttpUrl(capture.pageUrl).toString(),
        imageUrl: parseHttpUrl(capture.imageUrl).toString(),
        alt: capture.alt.trim().slice(0, DEEP_LINK_ATTRIBUTION_MAX_LENGTH),
      };
    }
  } catch {
    return null;
  }
  return null;
}

// Parses an extension fallback link: inkling://capture?url=&title=&selection=
// (quote), or inkling://capture?url=&image=&alt= (image). URLSearchParams.get
// already URL-decodes every value. The target URL is validated http(s)-only
// through parseHttpUrl. The selection is never rewritten: outer whitespace is
// trimmed and overlong selections are truncated, nothing else. `via` is a
// provenance marker from the extension and carries no semantics here.
export function parseDeepLinkCapture(value: string): DeepLinkCapture | null {
  return validateDeepLinkCapture(parseDeepLinkCaptureCore(value));
}
