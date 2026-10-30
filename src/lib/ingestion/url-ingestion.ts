import { parseHTML } from "linkedom";
import { extractWithDefuddle } from "./defuddle-adapter";
import { collectSafeEmbeds } from "./embeds";
import { UrlIngestionError } from "./errors";
import { cleanArticleHeadings, promoteInfoAsides } from "./article-cleanup";
import { extractFallback, visibleByline } from "./fallback";
import { downloadPage, fetchJson, runHttp } from "./http";
import { cleanCapturedHtml, collectImageUrls, hasReadableText, htmlToText } from "./captured-html";
import {
  normalizeHttpUrl,
  normalizePublishedDate,
  normalizeText,
  parseHttpUrl,
  uniqueStrings,
} from "./url";
import { normalizeXPostOEmbed, parseXPostUrl, xPostOEmbedUrl } from "./x-post";
import { providerLabel, videoLinkFromSourceUrl, type VideoLinkEmbed } from "./video-links";
import type {
  NormalizedArticle,
  RawArticleExtraction,
  UrlIngestionOptions,
  XPostMetadata,
} from "./types";

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

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function ingestVideoLink(
  sourceUrl: string,
  videoLink: VideoLinkEmbed,
  fetch: typeof globalThis.fetch | undefined,
  request: { timeoutMs: number; maxBytes: number },
): Promise<NormalizedArticle> {
  const host = videoLink.provider === "youtube" ? "www.youtube.com" : "vimeo.com";
  const metadata = (await runHttp(
    fetchJson(`https://${host}/oembed.json?url=${encodeURIComponent(videoLink.sourceUrl)}`, {
      ...request,
      timeoutMs: Math.min(request.timeoutMs, 4_000),
    }),
    fetch,
  )) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown } | null;
  const title = trimmedString(metadata?.title) || `${providerLabel(videoLink.provider)} video`;
  const author = trimmedString(metadata?.author_name);
  const poster =
    (typeof metadata?.thumbnail_url === "string"
      ? normalizeHttpUrl(metadata.thumbnail_url, sourceUrl)
      : null) ?? videoLink.posterUrl;

  return {
    sourceUrl,
    fetchedUrl: sourceUrl,
    canonicalUrl: sourceUrl,
    title,
    description: author
      ? `${providerLabel(videoLink.provider)} · ${author}`
      : `${providerLabel(videoLink.provider)} video`,
    author,
    publishedDate: null,
    html: "",
    text: title,
    imageUrls: poster ? [poster] : [],
    imageDimensions: [],
    safeEmbeds: [
      {
        kind: "iframe",
        provider: videoLink.provider,
        sourceUrl: videoLink.sourceUrl,
        embedUrl: videoLink.embedUrl,
        title,
      },
    ],
    extractor: "fallback",
  };
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

  let xPost: XPostMetadata | null = null;
  if (parseXPostUrl(sourceUrl)) {
    // X can block or rate-limit the oEmbed request. Without it, the normal page
    // pipeline still has a chance to succeed.
    const oEmbed = await runHttp(fetchJson(xPostOEmbedUrl(sourceUrl), request), fetch);
    try {
      xPost = oEmbed ? normalizeXPostOEmbed(sourceUrl, oEmbed as Record<string, unknown>) : null;
    } catch {
      xPost = null;
    }
  }

  if (xPost) {
    const text = xPost.text || `${xPost.authorName ?? "X"} post`;
    return {
      sourceUrl,
      fetchedUrl: sourceUrl,
      canonicalUrl: xPost.postUrl,
      title: xPost.authorName ? `${xPost.authorName}'s post` : "X post",
      description: text,
      author: xPost.authorName ?? "",
      publishedDate: xPost.publishedDate ?? null,
      html: xPost.embedHtml ?? "",
      text,
      imageUrls: [],
      imageDimensions: [],
      safeEmbeds: [],
      extractor: "fallback",
      social: xPost,
    };
  }

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
