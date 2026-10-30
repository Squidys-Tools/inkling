import { parseHTML } from "linkedom";
import { applyEmbedPolicy } from "./embeds";
import { normalizeHttpUrl, normalizeText, uniqueStrings } from "./url";

function urlsFromSrcSet(value: string | null, pageUrl: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .map((entry) => normalizeHttpUrl(entry, pageUrl))
    .filter((entry): entry is string => entry !== null);
}

function sanitizeElement(element: Element, pageUrl: string): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on") || name === "style" || name === "srcdoc" || name === "integrity") {
      element.removeAttribute(attribute.name);
    }
  }
  element.removeAttribute("srcset");
  applyEmbedPolicy(element, pageUrl);
}

/**
 * Keeps scripts, styles, forms and handlers out of stored HTML and the text
 * extracted from it, and resolves its links against the page. This is storage
 * hygiene on linkedom; the trust boundary is purifyHtml at render.
 */
export function cleanCapturedHtml(html: string, pageUrl: string): string {
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

export function hasReadableText(html: string | undefined) {
  return !!html && htmlToText(html).length > 0;
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
