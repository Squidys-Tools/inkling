import { parseHttpUrl } from "./ingestion/url";

// Mirror of the backend create_quote limits (storage.rs): selections longer
// than this are truncated before capture so deep links never fail validation.
export const DEEP_LINK_SELECTION_MAX_LENGTH = 1500;
export const DEEP_LINK_ATTRIBUTION_MAX_LENGTH = 240;

export type DeepLinkCapture =
  | { kind: "url"; url: string }
  | { kind: "quote"; url: string; selection: string; attribution: string };

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

// Parses an extension fallback link: inkling://capture?url=&title=&selection=
// plus legacy mymind:// links. URLSearchParams.get already URL-decodes every
// value. The target URL is validated http(s)-only through parseHttpUrl. The
// selection is never rewritten: outer whitespace is trimmed and overlong
// selections are truncated, nothing else.
export function parseDeepLinkCapture(value: string): DeepLinkCapture | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  // The desktop app registers only `inkling`; `mymind` keeps working for links
  // saved before the rename.
  if (!["inkling:", "mymind:"].includes(parsed.protocol) || parsed.hostname !== "capture") return null;

  const rawTarget = parsed.searchParams.get("url") ?? parsed.searchParams.get("source");
  if (!rawTarget) return null;

  let url: string;
  try {
    url = parseHttpUrl(rawTarget).toString();
  } catch {
    return null;
  }

  const selection = parsed.searchParams.get("selection")?.trim().slice(0, DEEP_LINK_SELECTION_MAX_LENGTH) ?? "";
  if (!selection) return { kind: "url", url };

  const title = parsed.searchParams.get("title")?.trim() ?? "";
  const attribution = (title || hostnameOf(url)).slice(0, DEEP_LINK_ATTRIBUTION_MAX_LENGTH);
  return { kind: "quote", url, selection, attribution };
}
