import { parseHTML } from "linkedom";
import { extractWithDefuddle } from "./defuddle-adapter.ts";
import { collectSafeEmbeds } from "./embeds.ts";
import { UrlIngestionError } from "./errors.ts";
import { cleanArticleHeadings, promoteInfoAsides } from "./article-cleanup.ts";
import { visibleByline } from "./byline.ts";
import { extractFallback } from "./fallback.ts";
import { downloadPage, runHttp } from "./http.ts";
import { ingestVideoLink, ingestXPost } from "./oembed.ts";
import {
  cleanCapturedHtml,
  collectImageUrls,
  hasReadableText,
  htmlToText,
} from "./captured-html.ts";
import {
  normalizeHttpUrl,
  normalizePublishedDate,
  normalizeText,
  parseHttpUrl,
  uniqueStrings,
} from "./url.ts";
import { parseXPostUrl } from "./x-post.ts";
import { videoLinkFromSourceUrl } from "./video-links.ts";
import type { NormalizedArticle, RawArticleExtraction, UrlIngestionOptions } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function mergeExtraction(
  primary: RawArticleExtraction,
  fallback: RawArticleExtraction,
): RawArticleExtraction {
  return {
    title: normalizeText(primary.title) || fallback.title,
    description: normalizeText(primary.description) || fallback.description,
    author: normalizeText(primary.author) || fallback.author,
    publishedDate: primary.publishedDate ?? fallback.publishedDate ?? null,
    canonicalUrl: primary.canonicalUrl ?? fallback.canonicalUrl,
    contentHtml: hasReadableText(primary.contentHtml) ? primary.contentHtml : fallback.contentHtml,
    imageUrls: uniqueStrings([...(fallback.imageUrls ?? []), ...(primary.imageUrls ?? [])]),
    imageDimensions: [
      ...(fallback.imageDimensions ?? []),
      ...(primary.imageDimensions ?? []),
    ].filter(
      (value, index, values) =>
        values.findIndex((candidate) => candidate.url === value.url) === index,
    ),
  };
}

function decodedFileName(pathname: string) {
  const segment = pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return normalizeText(decodeURIComponent(segment));
  } catch {
    return normalizeText(segment);
  }
}

// A link straight to an image, PDF or other file is kept as a link titled by
// its file name or host; the file itself is not downloaded.
function linkedFile(sourceUrl: string, fetchedUrl: string, contentType: string): NormalizedArticle {
  const { hostname, pathname } = new URL(fetchedUrl);
  return {
    sourceUrl,
    fetchedUrl,
    canonicalUrl: fetchedUrl,
    title: decodedFileName(pathname) || hostname,
    description: "",
    author: "",
    publishedDate: null,
    html: "",
    text: "",
    imageUrls: contentType.startsWith("image/") ? [fetchedUrl] : [],
    imageDimensions: [],
    safeEmbeds: [],
    extractor: "fallback",
  };
}

function parseDocument(html: string): Document {
  try {
    return parseHTML(html).document;
  } catch (cause) {
    throw new UrlIngestionError(
      "parse-failed",
      "The downloaded page could not be parsed as HTML.",
      { cause },
    );
  }
}

export async function ingestUrl(
  input: string,
  options: UrlIngestionOptions = {},
): Promise<NormalizedArticle> {
  const sourceUrl = parseHttpUrl(input, {
    allowPrivateNetwork: options.allowPrivateNetwork,
  }).toString();
  const { fetch } = options;
  const request = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    lookupHost: options.lookupHost,
  };

  const videoLink = videoLinkFromSourceUrl(sourceUrl);
  if (videoLink) return ingestVideoLink(sourceUrl, videoLink, fetch, request);

  const xPost = parseXPostUrl(sourceUrl) ? await ingestXPost(sourceUrl, fetch, request) : null;
  if (xPost) return xPost;

  const page = await runHttp(
    downloadPage(sourceUrl, { ...request, allowPrivateNetwork: options.allowPrivateNetwork }),
    fetch,
  );
  if (page.html === null) return linkedFile(sourceUrl, page.fetchedUrl, page.contentType);
  const { fetchedUrl, html: rawHtml } = page;

  const sourceDocument = parseDocument(rawHtml);
  const extractionDocument = parseDocument(rawHtml);
  promoteInfoAsides(extractionDocument);
  const fallback = extractFallback(sourceDocument, fetchedUrl);
  const extractArticle = options.extractArticle ?? extractWithDefuddle;
  let extraction = fallback;
  let extractor: "defuddle" | "fallback" = "fallback";

  try {
    const defuddleExtraction = extractArticle(extractionDocument, fetchedUrl);
    extraction = mergeExtraction(defuddleExtraction, fallback);
    if (hasReadableText(defuddleExtraction.contentHtml)) extractor = "defuddle";
  } catch {
    // A Defuddle failure leaves the fallback extraction in place.
  }

  const byline = visibleByline(sourceDocument);
  if (byline.author) extraction = { ...extraction, author: byline.author };
  if (byline.publishedDate) extraction = { ...extraction, publishedDate: byline.publishedDate };

  const title = normalizeText(extraction.title) || new URL(fetchedUrl).hostname;
  const description = normalizeText(extraction.description);
  const contentDocument = parseDocument(
    `<html><head></head><body>${cleanCapturedHtml(extraction.contentHtml ?? "", fetchedUrl)}</body></html>`,
  );
  // A page with no readable body still gives its card a title, summary, author and images.
  const cleaned = cleanArticleHeadings(contentDocument, title, description);
  const html = hasReadableText(cleaned) ? cleaned : "";

  const canonicalUrl = normalizeHttpUrl(extraction.canonicalUrl, fetchedUrl) ?? fetchedUrl;
  const imageUrls = uniqueStrings([
    ...collectImageUrls(sourceDocument, fetchedUrl),
    ...(extraction.imageUrls ?? [])
      .map((value) => normalizeHttpUrl(value, fetchedUrl))
      .filter((value): value is string => value !== null),
  ]);
  const imageDimensions = (extraction.imageDimensions ?? [])
    .map((value) => {
      const url = normalizeHttpUrl(value.url, fetchedUrl);
      return url ? { ...value, url } : null;
    })
    .filter(
      (value, index, values): value is NonNullable<typeof value> =>
        value !== null &&
        imageUrls.includes(value.url) &&
        values.findIndex((candidate) => candidate?.url === value.url) === index,
    );

  return {
    sourceUrl,
    fetchedUrl,
    canonicalUrl,
    title,
    description,
    author: normalizeText(extraction.author),
    publishedDate: normalizePublishedDate(extraction.publishedDate),
    html,
    text: html ? htmlToText(html) : "",
    imageUrls,
    imageDimensions,
    safeEmbeds: collectSafeEmbeds(sourceDocument, fetchedUrl),
    extractor,
  };
}
