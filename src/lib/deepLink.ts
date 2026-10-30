import { parseHttpUrl, tryParseHttpUrl } from "./ingestion/url";

export type DeepLinkCapture =
  | { kind: "url"; url: string; title?: string }
  | { kind: "quote"; url: string; selection: string; attribution: string }
  | { kind: "image"; pageUrl: string; imageUrl: string; alt: string };

const SELECTION_MAX_LENGTH = 1500;
const ATTRIBUTION_MAX_LENGTH = 240;

function readCaptureLink(value: string): DeepLinkCapture | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "inkling:" || parsed.hostname !== "capture") return null;

  const target = parsed.searchParams.get("url");
  const url = target ? tryParseHttpUrl(target)?.toString() : null;
  if (!url) return null;

  const selection =
    parsed.searchParams.get("selection")?.trim().slice(0, SELECTION_MAX_LENGTH) ?? "";
  if (selection) {
    const attribution =
      parsed.searchParams.get("title")?.trim() || new URL(url).hostname.replace(/^www\./u, "");
    return {
      kind: "quote",
      url,
      selection,
      attribution: attribution.slice(0, ATTRIBUTION_MAX_LENGTH),
    };
  }

  const rawImage = parsed.searchParams.get("image")?.trim() ?? "";
  if (rawImage) {
    const imageUrl = tryParseHttpUrl(rawImage)?.toString();
    if (!imageUrl) return null;
    return {
      kind: "image",
      pageUrl: url,
      imageUrl,
      alt: parsed.searchParams.get("alt")?.trim().slice(0, ATTRIBUTION_MAX_LENGTH) ?? "",
    };
  }

  const title = [...(parsed.searchParams.get("title")?.trim() ?? "")].slice(0, 500).join("");
  return title ? { kind: "url", url, title } : { kind: "url", url };
}

export function validateDeepLinkCapture(value: unknown): DeepLinkCapture | null {
  if (!value || typeof value !== "object") return null;

  const capture = value as Record<string, unknown>;
  try {
    if (capture.kind === "url" && typeof capture.url === "string") {
      const title =
        typeof capture.title === "string" ? [...capture.title.trim()].slice(0, 500).join("") : "";
      return {
        kind: "url",
        url: parseHttpUrl(capture.url).toString(),
        ...(title ? { title } : {}),
      };
    }
    if (
      capture.kind === "quote" &&
      typeof capture.url === "string" &&
      typeof capture.selection === "string" &&
      typeof capture.attribution === "string"
    ) {
      const selection = capture.selection.trim().slice(0, SELECTION_MAX_LENGTH);
      if (!selection) return null;
      return {
        kind: "quote",
        url: parseHttpUrl(capture.url).toString(),
        selection,
        attribution: capture.attribution.trim().slice(0, ATTRIBUTION_MAX_LENGTH),
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
        alt: capture.alt.trim().slice(0, ATTRIBUTION_MAX_LENGTH),
      };
    }
  } catch {
    return null;
  }
  return null;
}

// Parses inkling://capture?url=&title=&selection= (quote) or ?url=&image=&alt=
// (image). The URL must be http(s). The selection is only trimmed and truncated,
// never rewritten. `via` is extension provenance and carries no meaning here.
export function parseDeepLinkCapture(value: string): DeepLinkCapture | null {
  return validateDeepLinkCapture(readCaptureLink(value));
}
