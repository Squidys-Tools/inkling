import { parseHttpUrl } from "./ingestion/url";

// Mirror of the backend create_quote limits (storage.rs): selections longer
// than this are truncated before capture so deep links never fail validation.
export const DEEP_LINK_SELECTION_MAX_LENGTH = 1500;
export const DEEP_LINK_ATTRIBUTION_MAX_LENGTH = 240;

export type DeepLinkCapture =
  | { kind: "url"; url: string }
  | { kind: "quote"; url: string; selection: string; attribution: string }
  | { kind: "image"; pageUrl: string; imageUrl: string; alt: string };

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

// Parses an extension fallback link: inkling://capture?url=&title=&selection=
// (quote), or inkling://capture?url=&image=&alt= (image). URLSearchParams.get
// already URL-decodes every value. The target URL is validated http(s)-only
// through parseHttpUrl. The selection is never rewritten: outer whitespace is
// trimmed and overlong selections are truncated, nothing else. `via` is a
// provenance marker from the extension and carries no semantics here.
export function parseDeepLinkCapture(value: string): DeepLinkCapture | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "inkling:" || parsed.hostname !== "capture") return null;

  const rawTarget = parsed.searchParams.get("url");
  if (!rawTarget) return null;

  let url: string;
  try {
    url = parseHttpUrl(rawTarget).toString();
  } catch {
    return null;
  }

  const selection = parsed.searchParams.get("selection")?.trim().slice(0, DEEP_LINK_SELECTION_MAX_LENGTH) ?? "";
  if (selection) {
    const title = parsed.searchParams.get("title")?.trim() ?? "";
    const attribution = (title || hostnameOf(url)).slice(0, DEEP_LINK_ATTRIBUTION_MAX_LENGTH);
    return { kind: "quote", url, selection, attribution };
  }

  const rawImage = parsed.searchParams.get("image")?.trim() ?? "";
  if (rawImage) {
    let imageUrl: string;
    try {
      imageUrl = parseHttpUrl(rawImage).toString();
    } catch {
      return null;
    }
    const alt = parsed.searchParams.get("alt")?.trim().slice(0, DEEP_LINK_ATTRIBUTION_MAX_LENGTH) ?? "";
    return { kind: "image", pageUrl: url, imageUrl, alt };
  }

  return { kind: "url", url };
}
