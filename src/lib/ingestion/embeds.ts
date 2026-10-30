import { normalizeHttpUrl, normalizeText } from "./url";
import type { SafeEmbedCandidate, SafeEmbedKind, SafeEmbedProvider } from "./types";

const PROVIDER_HOSTS = new Map<string, SafeEmbedProvider>([
  ["youtube.com", "youtube"],
  ["www.youtube.com", "youtube"],
  ["youtube-nocookie.com", "youtube"],
  ["www.youtube-nocookie.com", "youtube"],
  ["youtu.be", "youtube"],
  ["vimeo.com", "vimeo"],
  ["www.vimeo.com", "vimeo"],
  ["player.vimeo.com", "vimeo"],
  ["loom.com", "loom"],
  ["www.loom.com", "loom"],
  ["open.spotify.com", "spotify"],
  ["soundcloud.com", "soundcloud"],
  ["w.soundcloud.com", "soundcloud"],
  ["player.twitch.tv", "twitch"],
]);

const SPOTIFY_TYPES = new Set([
  "album",
  "artist",
  "audiobook",
  "episode",
  "playlist",
  "show",
  "track",
]);

const MEDIA_EXTENSION = /\.(?:m3u8|mp3|mp4|ogg|oga|ogv|webm)(?:$|[?#])/i;

function providerEmbedUrl(url: URL, provider: SafeEmbedProvider): string | null {
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (provider === "youtube") {
    const id =
      url.hostname === "youtu.be"
        ? pathParts.length === 1
          ? pathParts[0]
          : null
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : ["shorts", "embed", "live", "v"].includes(pathParts[0] ?? "") && pathParts.length === 2
            ? pathParts[1]
            : null;
    return id && /^[a-zA-Z0-9_-]{6,32}$/u.test(id)
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
      : null;
  }

  if (provider === "vimeo") {
    const id = pathParts[pathParts.length - 1];
    return id && /^\d{1,20}$/u.test(id)
      ? `https://player.vimeo.com/video/${encodeURIComponent(id)}`
      : null;
  }

  if (provider === "loom") {
    const id = pathParts[pathParts.length - 1];
    return pathParts.length === 2 && ["share", "embed"].includes(pathParts[0] ?? "") && id
      ? `https://www.loom.com/embed/${encodeURIComponent(id)}`
      : null;
  }

  if (provider === "spotify") {
    const [type, id] = pathParts;
    return type &&
      id &&
      pathParts.length === 2 &&
      SPOTIFY_TYPES.has(type) &&
      /^[a-zA-Z0-9]+$/u.test(id)
      ? `https://open.spotify.com/embed/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
      : null;
  }

  if (provider === "soundcloud") {
    return url.hostname === "w.soundcloud.com" && url.pathname === "/player/"
      ? url.toString()
      : null;
  }

  if (provider === "twitch") {
    return url.searchParams.has("channel") || url.searchParams.has("video") ? url.toString() : null;
  }

  return null;
}

/**
 * The embed allowlist. An iframe passes only as a recognised player URL on a
 * provider host; direct audio and video pass only as a media file from a host
 * that is not a provider.
 */
export function embedCandidate(
  rawUrl: string | null,
  kind: SafeEmbedKind,
  pageUrl: string,
): Omit<SafeEmbedCandidate, "title"> | null {
  const sourceUrl = normalizeHttpUrl(rawUrl, pageUrl);
  if (!sourceUrl) return null;

  const url = new URL(sourceUrl);
  const provider = PROVIDER_HOSTS.get(url.hostname);
  if (kind === "iframe") {
    // www.vimeo.com counts as a provider host for media but is not an allowed iframe host.
    if (!provider || url.hostname === "www.vimeo.com") return null;
    const embedUrl = providerEmbedUrl(url, provider);
    return embedUrl ? { kind, provider, sourceUrl, embedUrl } : null;
  }

  if (provider || !MEDIA_EXTENSION.test(sourceUrl)) return null;
  return { kind, provider: "direct", sourceUrl, embedUrl: sourceUrl };
}

const URL_ATTRIBUTES = ["href", "xlink:href", "src", "poster", "cite"];

/**
 * Keeps an element's links to http(s) URLs resolved against the page, and holds
 * iframes and media sources to the embed allowlist. Capture and render share it
 * so stored and displayed HTML agree.
 */
export function applyEmbedPolicy(element: Element, pageUrl: string): void {
  for (const name of URL_ATTRIBUTES) {
    const raw = element.getAttribute(name);
    if (!raw) continue;
    const url = normalizeHttpUrl(raw, pageUrl);
    if (url) element.setAttribute(name, url);
    else element.removeAttribute(name);
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "iframe") {
    const candidate = embedCandidate(element.getAttribute("src"), "iframe", pageUrl);
    if (!candidate) {
      element.remove();
      return;
    }
    element.setAttribute("src", candidate.embedUrl);
    element.setAttribute("loading", "lazy");
    element.setAttribute("referrerpolicy", "no-referrer");
    element.removeAttribute("allow");
    element.removeAttribute("allowfullscreen");
    return;
  }

  const mediaParent = element.parentElement?.tagName.toLowerCase();
  const inMedia = mediaParent === "video" || mediaParent === "audio";
  if (tagName !== "video" && tagName !== "audio" && !(tagName === "source" && inMedia)) return;
  const src = element.getAttribute("src");
  const kind = tagName === "audio" || mediaParent === "audio" ? "audio" : "video";
  if (src && !embedCandidate(src, kind, pageUrl)) {
    if (tagName === "source") element.remove();
    else element.removeAttribute("src");
  }
}

function titleFor(element: Element): string | undefined {
  return (
    normalizeText(element.getAttribute("title") ?? element.getAttribute("aria-label")) || undefined
  );
}

export function collectSafeEmbeds(document: Document, pageUrl: string): SafeEmbedCandidate[] {
  const candidates: SafeEmbedCandidate[] = [];
  const add = (rawUrl: string | null, kind: SafeEmbedKind, title?: string) => {
    const candidate = embedCandidate(rawUrl, kind, pageUrl);
    if (candidate) candidates.push({ ...candidate, title });
  };

  for (const element of document.querySelectorAll("iframe[src], video[src], audio[src]")) {
    const tagName = element.tagName.toLowerCase();
    const kind = tagName === "iframe" ? "iframe" : tagName === "audio" ? "audio" : "video";
    add(element.getAttribute("src"), kind, titleFor(element));
  }

  for (const element of document.querySelectorAll(
    "video[poster], video source[src], audio source[src]",
  )) {
    const tagName = element.tagName.toLowerCase();
    const parentName = element.parentElement?.tagName.toLowerCase();
    const kind = tagName === "audio" || parentName === "audio" ? "audio" : "video";
    add(element.getAttribute("src"), kind, titleFor(element));
  }

  for (const element of document.querySelectorAll("meta[property], meta[name]")) {
    const key = (
      element.getAttribute("property") ??
      element.getAttribute("name") ??
      ""
    ).toLowerCase();
    if (key === "og:video" || key === "og:video:url" || key === "twitter:player") {
      add(element.getAttribute("content"), "iframe");
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.embedUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
