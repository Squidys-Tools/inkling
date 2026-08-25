import { sanitizeEmbedUrl, type SafeEmbedDescriptor } from "./safe-embeds";

export type VideoLinkProvider = "youtube" | "vimeo";

export type VideoLinkEmbed = {
  provider: VideoLinkProvider;
  embedUrl: string;
  sourceUrl: string;
  posterUrl?: string;
};

type VideoIframeDescriptor = Extract<SafeEmbedDescriptor, { type: "iframe" }>;

function youTubeIdFromEmbedUrl(embedUrl: string): string | null {
  const lastSegment = embedUrl.split("/").filter(Boolean).pop() ?? "";
  return /^[a-zA-Z0-9_-]{6,32}$/u.test(lastSegment) ? lastSegment : null;
}

function posterUrl(descriptor: VideoIframeDescriptor): string | undefined {
  if (descriptor.provider !== "youtube") return undefined;
  const id = youTubeIdFromEmbedUrl(descriptor.src);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}

/**
 * Recognizes saved links that point at a video page itself (YouTube, Vimeo).
 * Articles that merely embed a video keep their original kind.
 */
export function videoLinkFromSourceUrl(sourceUrl: string | null | undefined): VideoLinkEmbed | null {
  const trimmed = sourceUrl?.trim();
  if (!trimmed) return null;
  const descriptor = sanitizeEmbedUrl(trimmed);
  if (!descriptor || descriptor.type !== "iframe") return null;
  return {
    provider: descriptor.provider,
    embedUrl: descriptor.src,
    sourceUrl: trimmed,
    posterUrl: posterUrl(descriptor),
  };
}

export function autoplayEmbedUrl(embedUrl: string): string {
  return `${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=1`;
}

export function providerLabel(provider: VideoLinkProvider): string {
  return provider === "youtube" ? "YouTube" : "Vimeo";
}
