import { parseHTML } from "linkedom";
import { DefaultDefuddleAdapter } from "./defuddle-adapter";
import { collectSafeEmbeds } from "./embeds";
import { UrlIngestionError } from "./errors";
import { extractFallback } from "./fallback";
import { downloadPage, fetchJson, runHttp } from "./http";
import { cleanCapturedHtml, collectImageUrls, hasReadableText, htmlToText } from "./captured-html";
import { visibleByline } from "./fallback";
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

function normalizeHeadingText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Summary boxes ("At a Glance", TL;DR panels) are usually <aside> elements,
// which readers drop. Ones with a heading plus a list are article content, so
// promote them to <section> before extraction.
function promoteInfoAsides(document: Document): void {
  for (const aside of document.querySelectorAll("aside")) {
    if (!aside.querySelector("h2, h3, h4") || !aside.querySelector("ul, ol")) continue;
    const section = document.createElement("section");
    while (aside.firstChild) section.appendChild(aside.firstChild);
    for (const attribute of aside.attributes) section.setAttribute(attribute.name, attribute.value);
    aside.replaceWith(section);
  }
}

// The page title and subtitle/deck usually repeat inside the extracted body.
// Drop a leading heading that duplicates the title and turn a heading that
// duplicates the description into a lede paragraph.
function isDuplicateHeading(headingText: string, title: string): boolean {
  if (!headingText || !title) return false;
  if (headingText === title) return true;
  if (headingText.length < 4 || title.length < 4) return false;
  return title.startsWith(headingText) || headingText.startsWith(title);
}

function cleanArticleHeadings(document: Document, title: string, description: string): string {
  const headings = [...document.querySelectorAll("h1, h2, h3")].filter(
    (heading) => !heading.closest("section, aside"),
  );

  let index = 0;
  for (let guard = 0; guard < 2 && index < headings.length; guard += 1) {
    const heading = headings[index];
    if (!isDuplicateHeading(normalizeHeadingText(heading.textContent), normalizeHeadingText(title)))
      break;
    heading.remove();
    index += 1;
  }

  const ledeHeading = headings[index];
  const ledeText = normalizeHeadingText(ledeHeading?.textContent);
  const readsLikeSentence = ledeText.length >= 50 && /[.!?]$/u.test(ledeText);
  if (
    ledeHeading &&
    description &&
    (ledeText === normalizeHeadingText(description) || readsLikeSentence)
  ) {
    const lede = document.createElement("p");
    lede.className = "article-lede";
    lede.textContent = ledeHeading.textContent;
    ledeHeading.replaceWith(lede);
  }

  return document.body?.innerHTML ?? "";
}

async function ingestVideoLink(
  sourceUrl: string,
  videoLink: VideoLinkEmbed,
  fetchImpl: typeof globalThis.fetch | undefined,
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<NormalizedArticle> {
  let title = `${providerLabel(videoLink.provider)} video`;
  let author = "";
  let poster = videoLink.posterUrl;

  const host = videoLink.provider === "youtube" ? "www.youtube.com" : "vimeo.com";
  const metadata = (await runHttp(
    fetchJson(`https://${host}/oembed.json?url=${encodeURIComponent(videoLink.sourceUrl)}`, {
      timeoutMs: Math.min(timeoutMs, 4_000),
      maxBytes: maxResponseBytes,
    }),
    fetchImpl,
  )) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown } | null;
  if (typeof metadata?.title === "string" && metadata.title.trim()) title = metadata.title.trim();
  if (typeof metadata?.author_name === "string" && metadata.author_name.trim())
    author = metadata.author_name.trim();
  if (typeof metadata?.thumbnail_url === "string") {
    poster = normalizeHttpUrl(metadata.thumbnail_url, sourceUrl) ?? poster;
  }

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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const fetchImpl = options.fetch;

  const videoLink = videoLinkFromSourceUrl(sourceUrl);
  if (videoLink) {
    return ingestVideoLink(sourceUrl, videoLink, fetchImpl, timeoutMs, maxResponseBytes);
  }

  let xPost: XPostMetadata | null = null;
  if (parseXPostUrl(sourceUrl)) {
    // X can block or rate-limit the oEmbed request. Without it, the normal page
    // pipeline still has a chance to succeed.
    const oEmbed = await runHttp(
      fetchJson(xPostOEmbedUrl(sourceUrl), { timeoutMs, maxBytes: maxResponseBytes }),
      fetchImpl,
    );
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
    downloadPage(sourceUrl, {
      timeoutMs,
      maxBytes: maxResponseBytes,
      allowPrivateNetwork: options.allowPrivateNetwork,
    }),
    fetchImpl,
  );

  const sourceDocument = parseDocument(rawHtml);
  const extractionDocument = parseDocument(rawHtml);
  promoteInfoAsides(extractionDocument);
  const fallback = extractFallback(sourceDocument, fetchedUrl);
  const adapter = options.defuddleAdapter ?? new DefaultDefuddleAdapter();
  let extraction = fallback;
  let extractor: "defuddle" | "fallback" = "fallback";

  try {
    const defuddleExtraction = await adapter.extract(extractionDocument, fetchedUrl);
    extraction = mergeExtraction(defuddleExtraction, fallback);
    if (hasReadableText(defuddleExtraction.contentHtml)) extractor = "defuddle";
  } catch {
    extraction = fallback;
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
