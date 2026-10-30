import { parseHTML } from "linkedom";
import { embedCandidate } from "./embeds";
import { normalizeHttpUrl, normalizeText, uniqueStrings } from "./url";
import type { SafeEmbedKind } from "./types";

function urlsFromSrcSet(value: string | null, pageUrl: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .map((entry) => normalizeHttpUrl(entry, pageUrl))
    .filter((entry): entry is string => entry !== null);
}

function sanitizeElement(element: Element, pageUrl: string): void {
  const tagName = element.tagName.toLowerCase();
  const attributes = Array.from(element.attributes);

  for (const attribute of attributes) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on") || name === "style" || name === "srcdoc" || name === "integrity") {
      element.removeAttribute(attribute.name);
    }
  }

  for (const attributeName of ["href", "src", "poster", "cite"]) {
    const raw = element.getAttribute(attributeName);
    if (!raw) continue;
    const normalized = normalizeHttpUrl(raw, pageUrl);
    if (normalized) element.setAttribute(attributeName, normalized);
    else element.removeAttribute(attributeName);
  }

  element.removeAttribute("srcset");

  if (tagName === "iframe") {
    const candidate = embedCandidate(element.getAttribute("src"), "iframe", pageUrl);
    if (!candidate) {
      element.remove();
      return;
    }
    element.setAttribute("src", candidate.embedUrl);
    element.setAttribute("loading", "lazy");
    element.setAttribute("referrerpolicy", "no-referrer");
    element.removeAttribute("allow");
    element.removeAttribute("allowfullscreen");
  }

  const mediaParent = element.parentElement?.tagName.toLowerCase();
  if (
    tagName === "video" ||
    tagName === "audio" ||
    (tagName === "source" && (mediaParent === "video" || mediaParent === "audio"))
  ) {
    const rawSource = element.getAttribute("src");
    const kind: SafeEmbedKind = tagName === "audio" || mediaParent === "audio" ? "audio" : "video";
    if (rawSource && !embedCandidate(rawSource, kind, pageUrl)) {
      if (tagName === "source") element.remove();
      else element.removeAttribute("src");
    }
  }
}

export function sanitizeHtml(html: string, pageUrl: string): string {
  const { document } = parseHTML(`<html><head></head><body>${html}</body></html>`);
  for (const element of document.querySelectorAll("noscript")) {
    const parent = element.parentElement;
    if (!parent) continue;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    element.remove();
  }
  for (const selector of [
    "script",
    "template",
    "style",
    "link",
    "meta",
    "object",
    "embed",
    "form",
  ]) {
    for (const element of document.querySelectorAll(selector)) element.remove();
  }
  for (const element of document.querySelectorAll("*")) sanitizeElement(element, pageUrl);
  return document.body?.innerHTML ?? "";
}

export function htmlToText(html: string): string {
  const { document } = parseHTML(`<html><head></head><body>${html}</body></html>`);
  return normalizeText(document.body?.textContent);
}

/** True when the HTML contains any readable text after tags/whitespace are removed. */
export function hasReadableText(html: string | undefined | null): boolean {
  if (!html) return false;
  return htmlToText(html).length > 0;
}

export function collectImageUrls(document: Document, pageUrl: string): string[] {
  const values: string[] = [];

  for (const element of document.querySelectorAll(
    "img[src], source[src], video[poster], img[srcset], source[srcset]",
  )) {
    const raw = element.getAttribute("src") ?? element.getAttribute("poster");
    const normalized = normalizeHttpUrl(raw, pageUrl);
    if (normalized) values.push(normalized);
    values.push(...urlsFromSrcSet(element.getAttribute("srcset"), pageUrl));
  }

  for (const element of document.querySelectorAll("meta[property], meta[name]")) {
    const key = (
      element.getAttribute("property") ??
      element.getAttribute("name") ??
      ""
    ).toLowerCase();
    if (!key.includes("image")) continue;
    const normalized = normalizeHttpUrl(element.getAttribute("content"), pageUrl);
    if (normalized) values.push(normalized);
  }

  return uniqueStrings(values);
}
