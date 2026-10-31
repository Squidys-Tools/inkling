import type { LookupHost } from "./public-host.ts";

type IngestionExtractor = "defuddle" | "fallback";

export type SafeEmbedKind = "iframe" | "video" | "audio";

export type SafeEmbedProvider =
  | "direct"
  | "loom"
  | "soundcloud"
  | "spotify"
  | "twitch"
  | "vimeo"
  | "youtube";

export interface SafeEmbedCandidate {
  kind: SafeEmbedKind;
  provider: SafeEmbedProvider;
  sourceUrl: string;
  embedUrl: string;
  title?: string;
}

export interface ImageDimensions {
  url: string;
  width: number;
  height: number;
}

export interface XPostMetadata {
  provider: "x";
  postUrl: string;
  postId: string;
  embedHtml?: string;
  authorName?: string;
  authorUrl?: string;
  authorHandle?: string;
  text?: string;
  publishedDate?: string | null;
  width?: number | null;
}

export interface NormalizedArticle {
  sourceUrl: string;
  fetchedUrl: string;
  canonicalUrl: string;
  title: string;
  description: string;
  author: string;
  publishedDate: string | null;
  html: string;
  text: string;
  imageUrls: string[];
  imageDimensions: ImageDimensions[];
  safeEmbeds: SafeEmbedCandidate[];
  extractor: IngestionExtractor;
  social?: XPostMetadata;
}

export interface RawArticleExtraction {
  title?: string;
  description?: string;
  author?: string;
  publishedDate?: string | null;
  canonicalUrl?: string;
  contentHtml?: string;
  imageUrls?: string[];
  imageDimensions?: ImageDimensions[];
}

export interface UrlIngestionOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  extractArticle?: (document: Document, url: string) => RawArticleExtraction;
  /** Only enable this for trusted local fixture servers, never for user input. */
  allowPrivateNetwork?: boolean;
  lookupHost?: LookupHost;
}
