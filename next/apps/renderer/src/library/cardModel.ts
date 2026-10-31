import type { ItemDetail, ItemRecord, LibraryCard } from "@inkling/contracts";
import { videoLinkFromSourceUrl } from "@inkling/ingestion/video-links";
import { assetUrl, webUrl } from "./assets.ts";
import { expireLabelAt } from "./labelClock.ts";

export type ItemKind = "Article" | "Image" | "Note" | "PDF" | "Quote" | "Video" | "Post" | "File";

/** How a card draws in the grid. Kinds with no artwork fall back to the typed file card. */
type Treatment = "note" | "quote" | "pdf" | "article" | "video" | "file" | "media";
type MediaKind = "x-post" | "video" | "image" | "post" | "paper";

export type PostArt = {
  displayName: string;
  handle: string;
  body: string;
  published: string;
  avatarUrl?: string;
};

/** What a card shows, derived once per stored card. */
export type CardView = {
  id: string;
  kind: ItemKind;
  title: string;
  description: string;
  source: string;
  /** Only http(s) links; seeded and file items carry local paths in sourceUrl. */
  webUrl?: string;
  date: string;
  createdAt: number;
  tags: readonly string[];
  /** The managed thumbnail, else the original image, a remote image or a video poster. */
  image?: string;
  imageAlt: string;
  aspectRatio: number;
  pdfPageCount?: number;
  durationSeconds?: number;
  fileSizeBytes?: number;
  readingMinutes?: number;
  post?: PostArt;
  isXPost: boolean;
  isVideoLink: boolean;
  hasArticleContent: boolean;
  archived: boolean;
  treatment: Treatment;
  media: MediaKind;
};

export function displayKind(kind: string): ItemKind {
  switch (kind.toLowerCase()) {
    case "article":
    case "url":
      return "Article";
    case "image":
      return "Image";
    case "quote":
      return "Quote";
    case "pdf":
      return "PDF";
    case "video":
    case "embed":
      return "Video";
    case "post":
    case "tweet":
      return "Post";
    case "file":
      return "File";
    default:
      return "Note";
  }
}

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const text = (value: unknown) => (typeof value === "string" ? value : undefined);

function xPost(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.provider !== "x" || !text(record.postUrl) || !text(record.postId)) return undefined;
  const handle = text(record.authorHandle)?.replace(/^@/u, "");
  const published = text(record.publishedDate);
  return {
    handle,
    art: {
      displayName: text(record.authorName) ?? "X user",
      handle: handle ? `@${handle}` : "@x",
      body: text(record.text) ?? "Post preview unavailable.",
      published: published
        ? new Date(published).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "On X",
    } satisfies PostArt,
  };
}

const hour = 60 * 60 * 1000;

/** A card's date label, and the moment it next changes. */
function itemDateLabel(timestamp: number, now: number) {
  const age = now - timestamp;
  if (age < hour) return { label: "Just now", until: timestamp + hour };
  if (age < 24 * hour) return { label: "Today", until: timestamp + 24 * hour };
  return {
    label: new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
    until: Number.POSITIVE_INFINITY,
  };
}

function fallbackRatio(kind: ItemKind, isXPost: boolean) {
  if (isXPost) return 1.6;
  switch (kind) {
    case "Video":
      return 16 / 9;
    case "Article":
      return 16 / 10;
    case "Image":
    case "PDF":
      return 4 / 3;
    case "Quote":
      return 1.4;
    default:
      return 1.45;
  }
}

function treatmentOf(
  kind: ItemKind,
  image: string | undefined,
  post: PostArt | undefined,
): Treatment {
  switch (kind) {
    case "Note":
      return "note";
    case "Quote":
      return "quote";
    case "PDF":
      return "pdf";
    case "Article":
      return "article";
    case "Video":
      return image ? "video" : "file";
    case "File":
      return "file";
    default:
      return image || post ? "media" : "file";
  }
}

function mediaOf(
  kind: ItemKind,
  image: string | undefined,
  post: PostArt | undefined,
  isX: boolean,
) {
  if (isX && post) return "x-post";
  if (kind === "Video" && image) return "video";
  if (image) return "image";
  if (kind === "Post" && post) return "post";
  return "paper";
}

function remoteImage(metadata: LibraryCard["metadata"]) {
  const urls = Array.isArray(metadata.imageUrls) ? metadata.imageUrls : [];
  return urls.map((url) => webUrl(text(url))).find((url) => url !== undefined);
}

function remoteDimensions(metadata: LibraryCard["metadata"], url: string | undefined) {
  const entries = Array.isArray(metadata.imageDimensions) ? metadata.imageDimensions : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const width = positive(record.width);
    const height = positive(record.height);
    if (width && height && (!url || record.url === url)) return { width, height };
  }
  return undefined;
}

export function toCardView(card: LibraryCard, now = Date.now()): CardView {
  const { metadata } = card;
  const social = xPost(metadata.social);
  const baseKind = displayKind(card.kind);
  const video = baseKind === "Article" ? videoLinkFromSourceUrl(card.sourceUrl) : null;
  const kind: ItemKind = social ? "Post" : video ? "Video" : baseKind;
  const remote = remoteImage(metadata);
  const image =
    assetUrl(card.thumbnailPath) ??
    (kind === "Image" ? assetUrl(card.localAssetPath) : undefined) ??
    remote ??
    video?.posterUrl;
  const dimensions = remoteDimensions(metadata, remote);
  const width = positive(metadata.mediaWidth) ?? dimensions?.width;
  const height = positive(metadata.mediaHeight) ?? dimensions?.height;
  const aspectRatio =
    positive(metadata.mediaAspectRatio) ??
    (width && height ? width / height : fallbackRatio(kind, Boolean(social)));
  const title = card.title?.trim() || (kind === "Note" ? "Untitled note" : "Untitled");
  const description =
    social?.art.body.trim() ||
    card.description?.trim() ||
    card.ocrText.trim().slice(0, 180) ||
    (kind === "Quote" ? "" : "Saved to your mind.");
  const source = social
    ? `X${social.handle ? ` · @${social.handle}` : ""}`
    : card.sourceLabel || card.sourceUrl || "Quick note";
  const pageCount = positive(metadata.pdfPageCount);
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    id: card.id,
    kind,
    title,
    description,
    source,
    webUrl: webUrl(card.sourceUrl),
    date: itemDateLabel(card.createdAt, now).label,
    createdAt: card.createdAt,
    tags,
    image,
    imageAlt: card.title?.trim() || "",
    aspectRatio,
    pdfPageCount:
      baseKind === "PDF" && pageCount && Number.isInteger(pageCount) ? pageCount : undefined,
    durationSeconds: positive(metadata.durationSeconds),
    fileSizeBytes: positive(metadata.fileSizeBytes),
    readingMinutes: positive(metadata.readingMinutes),
    post: social?.art,
    isXPost: Boolean(social),
    isVideoLink: Boolean(video),
    hasArticleContent: card.hasArticleContent,
    archived: card.archived,
    treatment: treatmentOf(kind, image, social?.art),
    media: mediaOf(kind, image, social?.art, Boolean(social)),
  };
}

// Card objects are replaced whenever the library sends them again, so a view
// computed for one stays right for as long as that object lives and its date
// label holds. `clock` is the label clock's value: a caller that memoizes on
// its arguments asks again when a label may have expired.
const views = new WeakMap<LibraryCard, { view: CardView; clock: number; until: number }>();
export function cardView(card: LibraryCard, clock: number, now = Date.now()) {
  const held = views.get(card);
  if (held && (held.clock === clock || now < held.until)) {
    held.clock = clock;
    expireLabelAt(held.until);
    return held.view;
  }
  const view = toCardView(card, now);
  const { until } = itemDateLabel(card.createdAt, now);
  views.set(card, { view, clock, until });
  expireLabelAt(until);
  return view;
}

const cardMetadataKeys = [
  "tags",
  "social",
  "imageUrls",
  "imageDimensions",
  "mediaWidth",
  "mediaHeight",
  "mediaAspectRatio",
  "pdfPageCount",
  "durationSeconds",
  "fileSizeBytes",
  "readingMinutes",
] as const;

/** The card a freshly written item shows, so it appears before the library announces it. */
export function cardFromDetail(detail: ItemDetail | ItemRecord): LibraryCard {
  const metadata: Record<string, unknown> = {};
  for (const key of cardMetadataKeys)
    if (key in detail.metadata) metadata[key] = detail.metadata[key];
  const html = detail.metadata.html;
  return {
    id: detail.id,
    kind: detail.kind,
    title: detail.title,
    description: detail.description,
    sourceUrl: detail.sourceUrl,
    sourceLabel: detail.sourceLabel,
    localAssetPath: detail.localAssetPath,
    thumbnailPath: detail.thumbnailPath,
    palette: detail.palette,
    ocrText: detail.ocrText,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    archived: detail.archived,
    metadata,
    hasArticleContent:
      "hasArticleContent" in detail
        ? detail.hasArticleContent
        : typeof html === "string" && html.trim() !== "",
  };
}

export function quoteAttribution(description: string) {
  const value = description.trim();
  if (!value) return "";
  return value.startsWith("—") ? value : `— ${value}`;
}

export function pdfPreviewTitle(value: string) {
  return value
    .replaceAll("�", "’")
    .replace(/\.[^.]+$/u, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function fileExtensionLabel(name: string) {
  return /\.([a-z0-9]{1,5})$/iu.exec(name.trim())?.[1]?.toUpperCase() ?? "";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
