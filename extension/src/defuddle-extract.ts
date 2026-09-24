import Defuddle from "defuddle";
import {
  buildPageCapturePayload,
  INKLING_DEFUDDLE_OPTIONS,
  type PageCapturePayloadV1,
} from "@inkling/ingestion-shared";
import { FLATTEN_DONE_EVENT, FLATTEN_REQUEST_EVENT, FLATTEN_REQUEST_FLAG } from "./shadow-flatten";

export interface ExtractResult {
  ok: true;
  payload: PageCapturePayloadV1;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Inert parse of untrusted extraction HTML: DOMParser's document never runs
// scripts and does not fetch subresources, unlike assigning to innerHTML.
function parseUntrustedHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body;
}

function textFromHtml(html: string): string {
  return collapseWhitespace(parseUntrustedHtml(html).textContent ?? "");
}

function absoluteUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function imageUrlsFromContent(contentHtml: string, pageUrl: string, limit = 40): string[] {
  const container = parseUntrustedHtml(contentHtml);
  const urls: string[] = [];
  for (const img of container.querySelectorAll("img")) {
    const direct = absoluteUrl(img.getAttribute("src"), pageUrl);
    if (direct && !urls.includes(direct)) urls.push(direct);
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      for (const candidate of srcset.split(",")) {
        const url = absoluteUrl(candidate.trim().split(/\s+/)[0], pageUrl);
        if (url && !urls.includes(url)) urls.push(url);
        if (urls.length >= limit) return urls;
      }
    }
    if (urls.length >= limit) return urls;
  }
  return urls;
}

// Ask the MAIN-world stamper to flatten open shadow roots, then proceed
// whether it answers or not (CSP or injection failure must not block capture:
// a URL + title + best-effort content beats an error card).
function requestShadowFlatten(timeoutMs = 600): Promise<void> {
  try {
    document.documentElement.dataset[FLATTEN_REQUEST_FLAG] = "requested";
  } catch {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs);
    const onDone = () => {
      window.clearTimeout(timer);
      document.removeEventListener(FLATTEN_DONE_EVENT, onDone);
      resolve();
    };
    document.addEventListener(FLATTEN_DONE_EVENT, onDone, { once: true });
    document.dispatchEvent(new Event(FLATTEN_REQUEST_EVENT));
  });
}

/**
 * Extract the current page into a v1 capture payload. Runs against a CLONE of
 * the live document — Defuddle strips scripts/styles from the document it is
 * handed, and that must never touch the user's open page.
 */
export async function extractCurrentPage(): Promise<ExtractResult> {
  const pageUrl = window.location.href;
  await requestShadowFlatten();
  const clone = document.cloneNode(true) as Document;
  const result = new Defuddle(clone, {
    url: pageUrl,
    ...INKLING_DEFUDDLE_OPTIONS,
  }).parse();

  const contentHtml = typeof result.content === "string" ? result.content : "";
  const imageFromMeta = absoluteUrl(result.image, pageUrl);
  const imageUrls = imageUrlsFromContent(contentHtml, pageUrl);
  if (imageFromMeta && !imageUrls.includes(imageFromMeta)) imageUrls.unshift(imageFromMeta);
  const favicon = absoluteUrl(
    typeof result.favicon === "string" ? result.favicon : null,
    pageUrl,
  ) ?? undefined;

  const payload = buildPageCapturePayload({
    url: pageUrl,
    title: result.title || document.title,
    defuddledHtml: contentHtml,
    text: textFromHtml(contentHtml) || collapseWhitespace(document.title),
    author: result.author || undefined,
    publishedDate: result.published || null,
    imageUrls,
    ...(favicon ? { favicon } : {}),
  });
  return { ok: true, payload };
}
