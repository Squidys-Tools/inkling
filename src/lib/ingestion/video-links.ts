export type VideoLinkProvider = "youtube" | "vimeo";

export type VideoLinkEmbed = {
  provider: VideoLinkProvider;
  embedUrl: string;
  sourceUrl: string;
  posterUrl?: string;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

function validYouTubeId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,32}$/u.test(value);
}

function youtubeVideoId(url: URL, host: string): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return validYouTubeId(segments[0]) ? segments[0] : null;
  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return validYouTubeId(id) ? id : null;
  }
  if (["shorts", "embed", "live", "v"].includes(segments[0] ?? "")) {
    return validYouTubeId(segments[1]) ? segments[1] : null;
  }
  return null;
}

const VIMEO_PREFIXES = new Set(["video", "channels", "groups", "ondemand"]);

function vimeoVideoId(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  const candidate =
    segments.length === 1 || segments.some((segment) => VIMEO_PREFIXES.has(segment))
      ? segments[segments.length - 1]
      : undefined;
  return candidate && /^\d{1,20}$/u.test(candidate) ? candidate : null;
}

/**
 * Recognizes saved links that point at a video page itself (YouTube, Vimeo) and
 * rebuilds the embed URL from the video id alone, so no part of the saved URL
 * reaches an iframe. Articles that merely embed a video keep their original kind.
 */
export function videoLinkFromSourceUrl(
  sourceUrl: string | null | undefined,
): VideoLinkEmbed | null {
  const trimmed = sourceUrl?.trim();
  const url = trimmed ? parseHttpsUrl(trimmed) : null;
  if (!trimmed || !url) return null;

  const host = url.hostname.replace(/\.$/u, "");
  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeVideoId(url, host);
    return id
      ? {
          provider: "youtube",
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
          sourceUrl: trimmed,
          posterUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        }
      : null;
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoVideoId(url);
    return id
      ? { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}`, sourceUrl: trimmed }
      : null;
  }
  return null;
}

export function autoplayEmbedUrl(embedUrl: string): string {
  return `${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=1`;
}

export function providerLabel(provider: VideoLinkProvider): string {
  return provider === "youtube" ? "YouTube" : "Vimeo";
}
