import { fetchJson, runHttp, type RequestLimits } from "./http.ts";
import { normalizeHttpUrl } from "./url.ts";
import { providerLabel, type VideoLinkEmbed } from "./video-links.ts";
import { normalizeXPostOEmbed, xPostOEmbedUrl } from "./x-post.ts";
import type { NormalizedArticle, XPostMetadata } from "./types.ts";

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function ingestVideoLink(
  sourceUrl: string,
  videoLink: VideoLinkEmbed,
  fetch: typeof globalThis.fetch | undefined,
  request: RequestLimits,
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

// X can block or rate-limit the oEmbed request. Without it, the normal page
// pipeline still has a chance to succeed, so this returns null.
export async function ingestXPost(
  sourceUrl: string,
  fetch: typeof globalThis.fetch | undefined,
  request: RequestLimits,
): Promise<NormalizedArticle | null> {
  const oEmbed = await runHttp(fetchJson(xPostOEmbedUrl(sourceUrl), request), fetch);
  let xPost: XPostMetadata | null;
  try {
    xPost = oEmbed ? normalizeXPostOEmbed(sourceUrl, oEmbed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
  if (!xPost) return null;

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
