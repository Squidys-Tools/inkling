import { htmlToText, sanitizeHtml } from "./html-safety";
import { videoLinkFromSourceUrl, type VideoLinkEmbed } from "./video-links";
import { normalizeHttpUrl, normalizeText, parseHttpUrl } from "./url";

// TODO(phase1): share payload types + caps with extension/src/payload.ts via
// packages/ingestion-shared. Field names are identical on both sides so the
// move is mechanical; the *_MAX_* values below must match that file exactly.

// App-side receipt for Phase 3 browser-extension captures. Pure mapping only:
// no fetch, no Tauri invoke, no DOM writes. Callers wire the results into the
// existing capture paths — create_quote, save_file (the app downloads
// downloadUrl through the asset pipeline), and the video-links.ts path — so
// extension items get instant provisional cards exactly like other entries.

const EXTENSION_SELECTION_TEXT_MAX_CHARS = 1500;
const EXTENSION_ATTRIBUTION_MAX_CHARS = 240;
export const EXTENSION_IMAGE_DATA_URL_MAX_BYTES = 5 * 1024 * 1024;

export type ExtensionSelectionInput = {
  sourceUrl: string;
  selectedHtml: string;
  selectedText: string;
  title?: string;
};

export type ExtensionImageInput = {
  pageUrl: string;
  srcUrl: string;
  alt?: string;
  dataUrl?: string;
};

export type ExtensionVideoInput = {
  sourceUrl: string;
};

export type SelectionReceipt = {
  /** Ready for create_quote. */
  body: string;
  attribution: string;
  sourceUrl: string;
  /** Sanitized markup for metadata; never store or render the raw input. */
  sanitizedHtml: string;
};

export type ImageReceipt =
  | {
      via: "download";
      pageUrl: string;
      downloadUrl: string;
      fileName: string;
      alt: string;
    }
  | {
      via: "data-url";
      pageUrl: string;
      mimeType: string;
      byteLength: number;
      dataUrl: string;
      fileName: string;
      alt: string;
    };

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function httpUrl(value: string): string | null {
  try {
    return parseHttpUrl(value).toString();
  } catch {
    return null;
  }
}

/**
 * Selection → create_quote input with source attribution. The extension HTML
 * is untrusted: it is sanitized against the source page and only the plain
 * readable text becomes the stored body, truncated so capture never fails
 * backend validation.
 */
export function mapExtensionSelection(input: ExtensionSelectionInput): SelectionReceipt | null {
  const sourceUrl = httpUrl(input.sourceUrl);
  if (!sourceUrl) return null;

  const sanitizedHtml = sanitizeHtml(input.selectedHtml ?? "", sourceUrl);
  const body = (normalizeText(input.selectedText) || htmlToText(sanitizedHtml)).slice(
    0,
    EXTENSION_SELECTION_TEXT_MAX_CHARS,
  );
  if (!body) return null;

  const attribution = (normalizeText(input.title) || hostnameOf(sourceUrl)).slice(
    0,
    EXTENSION_ATTRIBUTION_MAX_CHARS,
  );
  return { body, attribution, sourceUrl, sanitizedHtml };
}

const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml));base64,([a-zA-Z0-9+/=\s]+)$/u;

function base64ByteLength(payload: string): number {
  const compact = payload.replace(/\s/gu, "");
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.floor((compact.length * 3) / 4) - padding;
}

function imageFileName(srcUrl: string, alt: string, mimeType: string | null): string {
  const segment = srcUrl.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ?? "";
  const clean = segment.replace(/[^a-zA-Z0-9._-]+/gu, "_").slice(0, 80);
  if (clean.includes(".")) return clean;
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType?.split("/")[1]?.replace("svg+xml", "svg");
  const stemSource = alt.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40);
  return `${stemSource || "inkling-image"}.${extension || "png"}`;
}

/**
 * Image → save_file instruction. http(s) sources download through the app's
 * existing asset pipeline; dataUrl is honored only for blob/canvas fallbacks
 * and only under the size cap.
 */
export function mapExtensionImage(input: ExtensionImageInput): ImageReceipt | null {
  const pageUrl = httpUrl(input.pageUrl);
  if (!pageUrl) return null;
  const alt = normalizeText(input.alt).slice(0, 240);

  const downloadUrl = normalizeHttpUrl(input.srcUrl, pageUrl);
  if (downloadUrl) {
    return {
      via: "download",
      pageUrl,
      downloadUrl,
      fileName: imageFileName(downloadUrl, alt, null),
      alt,
    };
  }

  const match = DATA_URL_RE.exec((input.dataUrl ?? "").trim());
  if (!match) return null;
  const mimeType = match[1];
  const byteLength = base64ByteLength(match[2]);
  if (byteLength <= 0 || byteLength > EXTENSION_IMAGE_DATA_URL_MAX_BYTES) return null;
  return {
    via: "data-url",
    pageUrl,
    mimeType,
    byteLength,
    dataUrl: input.dataUrl!.trim(),
    fileName: imageFileName(pageUrl, alt, mimeType),
    alt,
  };
}

/** Video → existing video-links.ts path (YouTube/Vimeo pass-through). */
export function mapExtensionVideo(input: ExtensionVideoInput): VideoLinkEmbed | null {
  return videoLinkFromSourceUrl(input.sourceUrl?.trim());
}

// Card-type correctness: extension captures must each render their own card
// treatment (quote-art, image, video poster, article body) and never collapse
// into a generic bookmark/File card. Article arrives through the existing URL
// path; the other three arrive through the mappers above.
export type ExtensionCardKind = "Quote" | "Image" | "Video" | "Article";

export function cardKindForExtensionCapture(kind: "selection" | "image" | "video" | "article"): ExtensionCardKind {
  switch (kind) {
    case "selection":
      return "Quote";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "article":
      return "Article";
  }
}
