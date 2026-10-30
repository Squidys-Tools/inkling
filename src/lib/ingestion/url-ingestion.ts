import { parseHTML } from "linkedom";
import { extractWithDefuddle } from "./defuddle-adapter";
import { collectSafeEmbeds } from "./embeds";
import { UrlIngestionError } from "./errors";
import { cleanArticleHeadings, promoteInfoAsides } from "./article-cleanup";
import { visibleByline } from "./byline";
import { extractFallback } from "./fallback";
import { downloadPage, runHttp } from "./http";
import { ingestVideoLink, ingestXPost } from "./oembed";
import { cleanCapturedHtml, collectImageUrls, hasReadableText, htmlToText } from "./captured-html";
import {
  normalizeHttpUrl,
  normalizePublishedDate,
  normalizeText,
  parseHttpUrl,
  uniqueStrings,
} from "./url";
import { parseXPostUrl } from "./x-post";
import { videoLinkFromSourceUrl } from "./video-links";
import type { NormalizedArticle, RawArticleExtraction, UrlIngestionOptions } from "./types";

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
  };

  const videoLink = videoLinkFromSourceUrl(sourceUrl);
  if (videoLink) return ingestVideoLink(sourceUrl, videoLink, fetch, request);

  const xPost = parseXPostUrl(sourceUrl) ? await ingestXPost(sourceUrl, fetch, request) : null;
  if (xPost) return xPost;

  const { fetchedUrl, html: rawHtml } = await runHttp(
    downloadPage(sourceUrl, { ...request, allowPrivateNetwork: options.allowPrivateNetwork }),
    fetch,
  );

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
  const html = cleanArticleHeadings(contentDocument, title, description);
  if (!hasReadableText(html)) {
    throw new UrlIngestionError(
      "extraction-failed",
      "No readable article content was found on the page.",
      {
        url: fetchedUrl,
      },
    );
  }

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
    text: htmlToText(html),
    imageUrls,
    imageDimensions,
    safeEmbeds: collectSafeEmbeds(sourceDocument, fetchedUrl),
    extractor,
  };
}
