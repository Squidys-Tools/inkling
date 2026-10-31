import { publicWebUrl } from "./web-url.ts";

export type DeepLinkCapture =
  | { kind: "url"; url: string; title?: string }
  | { kind: "quote"; url: string; selection: string; attribution: string }
  | { kind: "image"; pageUrl: string; imageUrl: string; alt: string };

// The library's own limits for a quote; a longer one would fail to save.
const selectionMaxLength = 1500;
const attributionMaxLength = 240;
const titleMaxLength = 500;

const firstCharacters = (value: string, count: number) => [...value].slice(0, count).join("");

/**
 * Parses `inkling://capture?url=&title=`, the quote form (`&selection=`) and the
 * image form (`&image=&alt=`). Every URL must be public http(s). The selection
 * is only trimmed and truncated, never rewritten; `via` is extension provenance
 * and carries no meaning here.
 */
export function parseDeepLink(value: string): DeepLinkCapture | null {
  let link: URL;
  try {
    link = new URL(value);
  } catch {
    return null;
  }
  if (link.protocol !== "inkling:" || link.hostname !== "capture") return null;
  const parameter = (name: string) => link.searchParams.get(name)?.trim() ?? "";

  const url = publicWebUrl(parameter("url"));
  if (!url) return null;

  const selection = parameter("selection").slice(0, selectionMaxLength);
  if (selection) {
    const attribution = parameter("title") || new URL(url).hostname.replace(/^www\./u, "");
    return {
      kind: "quote",
      url,
      selection,
      attribution: attribution.slice(0, attributionMaxLength),
    };
  }

  if (parameter("image")) {
    const imageUrl = publicWebUrl(parameter("image"));
    if (!imageUrl) return null;
    return {
      kind: "image",
      pageUrl: url,
      imageUrl,
      alt: parameter("alt").slice(0, attributionMaxLength),
    };
  }

  const title = firstCharacters(parameter("title"), titleMaxLength);
  return title ? { kind: "url", url, title } : { kind: "url", url };
}

/** The `inkling:` links among a second instance's arguments (Windows and Linux pass links this way). */
export const deepLinksIn = (argv: readonly string[]) =>
  argv.filter((argument) => argument.startsWith("inkling:"));
