import { cutCapture } from "@inkling/contracts/capture";
import { publicWebUrl } from "./web-url.ts";

export type DeepLinkCapture =
  | { kind: "url"; url: string; title?: string }
  | { kind: "quote"; url: string; selection: string; attribution: string }
  | { kind: "image"; pageUrl: string; imageUrl: string; alt: string };

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

  const selection = cutCapture.quote(parameter("selection"));
  if (selection) {
    const attribution = parameter("title") || new URL(url).hostname.replace(/^www\./u, "");
    return {
      kind: "quote",
      url,
      selection,
      attribution: cutCapture.attribution(attribution),
    };
  }

  if (parameter("image")) {
    const imageUrl = publicWebUrl(parameter("image"));
    if (!imageUrl) return null;
    return {
      kind: "image",
      pageUrl: url,
      imageUrl,
      alt: cutCapture.attribution(parameter("alt")),
    };
  }

  const title = cutCapture.title(parameter("title"));
  return title ? { kind: "url", url, title } : { kind: "url", url };
}
