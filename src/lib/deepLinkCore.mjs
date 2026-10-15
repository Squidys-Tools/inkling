export const DEEP_LINK_SELECTION_MAX_LENGTH = 1500;
export const DEEP_LINK_ATTRIBUTION_MAX_LENGTH = 240;

const MAX_URL_LENGTH = 8_192;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/u;
const BARE_HOST_RE =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\.?(:\d+)?(?:\/[^\s]*)?$/u;

export function parseHttpUrlCore(value) {
  const trimmed = value.trim();
  const normalized = SCHEME_RE.test(trimmed)
    ? trimmed
    : BARE_HOST_RE.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
  if (!normalized || normalized.length > MAX_URL_LENGTH) return null;

  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      !url.hostname
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

export function parseDeepLinkCaptureCore(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "inkling:" || parsed.hostname !== "capture") return null;

  const target = parsed.searchParams.get("url");
  const url = target ? parseHttpUrlCore(target)?.toString() : null;
  if (!url) return null;

  const selection =
    parsed.searchParams.get("selection")?.trim().slice(0, DEEP_LINK_SELECTION_MAX_LENGTH) ?? "";
  if (selection) {
    const title = parsed.searchParams.get("title")?.trim() ?? "";
    return {
      kind: "quote",
      url,
      selection,
      attribution: (title || hostnameOf(url)).slice(0, DEEP_LINK_ATTRIBUTION_MAX_LENGTH),
    };
  }

  const rawImage = parsed.searchParams.get("image")?.trim() ?? "";
  if (rawImage) {
    const imageUrl = parseHttpUrlCore(rawImage)?.toString();
    if (!imageUrl) return null;
    return {
      kind: "image",
      pageUrl: url,
      imageUrl,
      alt: parsed.searchParams.get("alt")?.trim().slice(0, DEEP_LINK_ATTRIBUTION_MAX_LENGTH) ?? "",
    };
  }

  const title = [...(parsed.searchParams.get("title")?.trim() ?? "")].slice(0, 500).join("");
  return title ? { kind: "url", url, title } : { kind: "url", url };
}
