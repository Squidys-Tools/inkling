import { bylineAuthor } from "./byline.ts";
import { extractJsonLdMetadata } from "./json-ld.ts";
import { normalizeHttpUrl, normalizePublishedDate, normalizeText } from "./url.ts";
import type { ImageDimensions, RawArticleExtraction } from "./types.ts";

const META_DESCRIPTION_NAMES = ["description", "og:description", "twitter:description"];
const META_AUTHOR_NAMES = ["author", "article:author", "byl", "byline"];
const META_DATE_NAMES = [
  "article:published_time",
  "datePublished",
  "datepublished",
  "publishdate",
  "publish_date",
  "date",
];

function metaContent(document: Document, names: string[]): string | null {
  for (const name of names) {
    const element = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    const content = element?.getAttribute("content");
    if (content?.trim()) {
      return content.trim();
    }
  }

  return null;
}

function firstMeaningfulText(document: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const text = normalizeText(document.querySelector(selector)?.textContent);
    if (text) {
      return text;
    }
  }

  return "";
}

function positiveDimension(value: string | null): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function extractImageDimensions(document: Document, baseUrl: string): ImageDimensions[] {
  const values: ImageDimensions[] = [];

  for (const element of document.querySelectorAll("img[src], source[src], video[poster]")) {
    const raw = element.getAttribute("src") ?? element.getAttribute("poster");
    const url = normalizeHttpUrl(raw, baseUrl);
    const width = positiveDimension(element.getAttribute("width"));
    const height = positiveDimension(element.getAttribute("height"));
    if (url && width && height) values.push({ url, width, height });
  }

  const openGraphUrl = normalizeHttpUrl(metaContent(document, ["og:image"]), baseUrl);
  const openGraphWidth = positiveDimension(
    metaContent(document, ["og:image:width", "twitter:image:width"]),
  );
  const openGraphHeight = positiveDimension(
    metaContent(document, ["og:image:height", "twitter:image:height"]),
  );
  if (openGraphUrl && openGraphWidth && openGraphHeight) {
    values.push({ url: openGraphUrl, width: openGraphWidth, height: openGraphHeight });
  }

  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.url)) return false;
    seen.add(value.url);
    return true;
  });
}

function contentRoot(document: Document): Element | null {
  const candidates = [
    ...document.querySelectorAll("article"),
    ...document.querySelectorAll("main"),
    ...document.querySelectorAll('[role="main"]'),
  ];

  return (
    candidates.find((candidate) => normalizeText(candidate.textContent).length > 80) ??
    candidates[0] ??
    document.body
  );
}

export function extractDocumentAuthor(document: Document): string {
  return metaContent(document, META_AUTHOR_NAMES) ?? bylineAuthor(document);
}

export function extractFallback(document: Document, url: string): RawArticleExtraction {
  const root = contentRoot(document);
  const canonical = normalizeHttpUrl(
    document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    url,
  );
  const published =
    metaContent(document, META_DATE_NAMES) ??
    document.querySelector("time[datetime]")?.getAttribute("datetime") ??
    null;
  const structured = extractJsonLdMetadata(document, url);

  return {
    title:
      structured.title ??
      metaContent(document, ["og:title", "twitter:title"]) ??
      firstMeaningfulText(document, ["h1", "title"]),
    description: structured.description ?? metaContent(document, META_DESCRIPTION_NAMES) ?? "",
    author: structured.author ?? extractDocumentAuthor(document),
    publishedDate: normalizePublishedDate(structured.publishedDate ?? published),
    canonicalUrl: canonical ?? url,
    contentHtml: root?.innerHTML ?? "",
    imageUrls: structured.imageUrls,
    imageDimensions: extractImageDimensions(document, url),
  };
}
