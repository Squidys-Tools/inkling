import Defuddle from "defuddle";
import { extractDocumentAuthor } from "./fallback.ts";
import { hasReadableText } from "./captured-html.ts";
import { extractJsonLdMetadata } from "./json-ld.ts";
import { normalizeHttpUrl, normalizePublishedDate, normalizeText, uniqueStrings } from "./url.ts";
import type { RawArticleExtraction } from "./types.ts";

export function extractWithDefuddle(document: Document, url: string): RawArticleExtraction {
  // Defuddle's metadata extractor needs an absolute canonical link; many pages use a relative one.
  const canonical = document.querySelector('link[rel="canonical"]');
  const canonicalUrl = normalizeHttpUrl(canonical?.getAttribute("href"), url);
  if (canonicalUrl) canonical?.setAttribute("href", canonicalUrl);

  const result = new Defuddle(document, {
    url,
    removeImages: false,
    standardize: true,
    useAsync: false,
  }).parse();

  const structured = extractJsonLdMetadata(document, url);
  const image = normalizeHttpUrl(result.image, url);

  return {
    title: normalizeText(result.title) || structured.title,
    description: normalizeText(result.description) || structured.description,
    author:
      structured.author ||
      normalizeText(extractDocumentAuthor(document)) ||
      normalizeText(result.author),
    publishedDate: normalizePublishedDate(result.published ?? structured.publishedDate ?? null),
    canonicalUrl: canonicalUrl ?? undefined,
    contentHtml: hasReadableText(result.content) ? result.content : "",
    imageUrls: uniqueStrings([...(image ? [image] : []), ...(structured.imageUrls ?? [])]),
  };
}
