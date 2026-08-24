import { parseHTML } from "linkedom";
import { sanitizeHtml } from "./html-safety";
import { normalizeHttpUrl, normalizePublishedDate, normalizeText } from "./url";
import type { XPostMetadata } from "./types";

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);
const POST_ID_PATTERN = /^\d{1,30}$/u;

export type XPostUrl = {
  postUrl: string;
  postId: string;
  authorHandle?: string;
};

export type XPostOEmbedResponse = {
  html?: unknown;
  author_name?: unknown;
  author_url?: unknown;
  width?: unknown;
};

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function authorHandleFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const segment = new URL(value).pathname.split("/").filter(Boolean)[0];
    return segment && segment !== "i" ? segment : undefined;
  } catch {
    return undefined;
  }
}

export function parseXPostUrl(input: string): XPostUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (!X_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const statusIndex = segments.findIndex((segment) => segment.toLowerCase() === "status");
  const postId = statusIndex >= 1 ? segments[statusIndex + 1] : undefined;
  if (!postId || !POST_ID_PATTERN.test(postId)) return null;

  const authorHandle = segments[0]?.toLowerCase() === "i" ? undefined : segments[statusIndex - 1];
  url.hash = "";
  return {
    postUrl: url.toString(),
    postId,
    authorHandle,
  };
}

export function xPostOEmbedUrl(postUrl: string): string {
  const params = new URLSearchParams({
    url: postUrl,
    omit_script: "1",
    dnt: "1",
    maxwidth: "550",
    theme: "light",
  });
  return `https://publish.x.com/oembed?${params.toString()}`;
}

export function normalizeXPostOEmbed(sourceUrl: string, response: XPostOEmbedResponse): XPostMetadata | null {
  const parsedUrl = parseXPostUrl(sourceUrl);
  const rawHtml = textValue(response.html);
  if (!parsedUrl || !rawHtml) return null;

  const embedHtml = sanitizeHtml(rawHtml, parsedUrl.postUrl);
  if (!/<blockquote\b[^>]*class=["'][^"']*twitter-tweet\b[^"']*["']/iu.test(embedHtml)) return null;

  const { document } = parseHTML(`<html><body>${embedHtml}</body></html>`);
  const blockquote = document.querySelector("blockquote.twitter-tweet");
  const text = normalizeText(blockquote?.querySelector("p")?.textContent);
  const dateLink = [...(blockquote?.querySelectorAll("a") ?? [])]
    .find((anchor) => anchor.getAttribute("href")?.includes(`/status/${parsedUrl.postId}`));
  const authorUrl = normalizeHttpUrl(textValue(response.author_url), parsedUrl.postUrl) ?? undefined;
  const authorName = textValue(response.author_name);
  const width = typeof response.width === "number" && Number.isFinite(response.width) ? response.width : null;

  return {
    provider: "x",
    postUrl: parsedUrl.postUrl,
    postId: parsedUrl.postId,
    embedHtml,
    authorName,
    authorUrl,
    authorHandle: authorHandleFromUrl(authorUrl) ?? parsedUrl.authorHandle,
    text,
    publishedDate: normalizePublishedDate(normalizeText(dateLink?.textContent)) ?? null,
    width,
  };
}
