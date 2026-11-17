import { downloadPage, fetchJson, runHttp, type RequestLimits } from "./http.ts";
import { normalizeHttpUrl } from "./url.ts";
import { providerLabel, type VideoLinkEmbed } from "./video-links.ts";
import { normalizeXPostOEmbed, parseXPostUrl, xPostOEmbedUrl } from "./x-post.ts";
import { X_PAGE_USER_AGENT, xPostFromPage, xPostPageUrls, xPostSearchText } from "./x-post-page.ts";
import type { NormalizedArticle, XPostMetadata } from "./types.ts";

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Neither provider serves `/oembed.json` on its own host: YouTube answers at
// `/oembed` and Vimeo under `/api/`, and the wrong paths return an HTML 404.
export const videoOEmbedUrl = ({ provider, sourceUrl }: VideoLinkEmbed) =>
  provider === "youtube"
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`
    : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(sourceUrl)}`;

export async function ingestVideoLink(
  sourceUrl: string,
  videoLink: VideoLinkEmbed,
  fetch: typeof globalThis.fetch | undefined,
  request: RequestLimits,
): Promise<NormalizedArticle> {
  const metadata = (await runHttp(
    fetchJson(videoOEmbedUrl(videoLink), {
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

const X_PAGE_HOSTS: ReadonlySet<string> = new Set(["x.com", "www.x.com"]);
const X_PAGE_TIMEOUT_MS = 8_000;

// Logged out, X often answers its own page with a shell that has no post in it, or with a
// rate limit. Either way the post keeps whatever oEmbed gave it.
async function xPostPage(
  postId: string,
  handle: string | undefined,
  fetch: typeof globalThis.fetch | undefined,
  request: RequestLimits,
) {
  for (const url of xPostPageUrls(postId, handle)) {
    const page = await runHttp(
      downloadPage(url, {
        ...request,
        timeoutMs: Math.min(request.timeoutMs, X_PAGE_TIMEOUT_MS),
        userAgent: X_PAGE_USER_AGENT,
        allowedHosts: X_PAGE_HOSTS,
      }),
      fetch,
    ).catch(() => null);
    const rich = page?.html ? xPostFromPage(page.html, postId) : null;
    if (rich) return rich;
  }
  return null;
}

const defined = <T extends object>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Partial<T>;

// X can block or rate-limit either request. With neither answering, the normal page
// pipeline still has a chance to succeed, so this returns null.
export async function ingestXPost(
  sourceUrl: string,
  fetch: typeof globalThis.fetch | undefined,
  request: RequestLimits,
): Promise<NormalizedArticle | null> {
  const parsed = parseXPostUrl(sourceUrl);
  if (!parsed) return null;
  const [oEmbed, rich] = await Promise.all([
    runHttp(fetchJson(xPostOEmbedUrl(sourceUrl), request), fetch),
    xPostPage(parsed.postId, parsed.authorHandle, fetch, request),
  ]);
  let embedded: XPostMetadata | null;
  try {
    embedded = oEmbed ? normalizeXPostOEmbed(sourceUrl, oEmbed as Record<string, unknown>) : null;
  } catch {
    embedded = null;
  }
  if (!embedded && !rich) return null;
  const xPost: XPostMetadata = {
    ...(embedded ?? { provider: "x", postUrl: parsed.postUrl, postId: parsed.postId }),
    ...(rich && defined(rich)),
  };

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
    // metadata.text is what search indexes, so it carries the quote, card, poll and alt text too.
    text: xPostSearchText(xPost) || text,
    imageUrls: [],
    imageDimensions: [],
    safeEmbeds: [],
    extractor: "fallback",
    social: xPost,
  };
}
