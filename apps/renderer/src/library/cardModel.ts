import type { ItemDetail, ItemRecord, LibraryCard } from "@inkling/contracts";
import { displayKind, itemKind, type ItemKind } from "@inkling/ingestion/item-kind";
import { videoLinkFromSourceUrl } from "@inkling/ingestion/video-links";
import { dayAndMonth, dayMonthYear, monthDayStamp } from "../format.ts";
import { assetUrl, hostname, webUrl } from "./assets.ts";
import { expireLabelAt } from "./labelClock.ts";

export { displayKind, type ItemKind };

/** How a card draws in the grid. Kinds with no artwork fall back to the typed file card. */
type Treatment = "note" | "quote" | "pdf" | "article" | "video" | "file" | "media" | "post";
type MediaKind = "x-post" | "video" | "image" | "paper";

/** A run of a post's text; `link` runs are a URL, mention, hashtag or cashtag. */
export type PostPart = { text: string; link: boolean };

type Verified = "blue" | "business" | "government";

export type PostAuthor = {
  displayName: string;
  handle: string;
  /** Absent when the post's date is unknown. */
  published?: string;
  avatarUrl?: string;
  squareAvatar: boolean;
  verified?: Verified;
};

export type PostMedia = {
  kind: "photo" | "video" | "gif";
  url: string;
  ratio: number;
  durationSeconds?: number;
};

export type PostArt = PostAuthor & {
  body: string;
  parts: PostPart[];
  /** Only pictures the library holds a copy of; a missing one is left out, never fetched from X. */
  media: PostMedia[];
  quote?: PostAuthor & { parts: PostPart[]; image?: string };
  linkCard?: { title: string; domain: string; image?: string; ratio: number; large: boolean };
  poll?: { choices: { label: string; percent?: number; winner: boolean }[]; summary: string };
  replyTo?: string;
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
  /** The managed thumbnail, else an original small enough to draw, a remote image or a video poster. */
  image?: string;
  /** A saved image with nothing small enough to draw, until or unless its thumbnail exists. */
  noPreview: boolean;
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
  /** A managed original exists to reveal; a thumbnail alone is not the saved file. */
  hasLocalFile: boolean;
  archived: boolean;
  /** "Archived today", from the last write, which for an archived item is archiving it. */
  archivedLabel?: string;
  treatment: Treatment;
  media: MediaKind;
};

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const record = (value: unknown) => (isRecord(value) ? value : undefined);
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const offset = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;

/**
 * A post's text cut into plain and linked runs. Spans are UTF-16 offsets; one that overlaps an
 * earlier span, runs past the text or would split an emoji's surrogate pair stays plain.
 */
export function postParts(body: string, entities: unknown): PostPart[] {
  const splitsPair = (index: number) => {
    const code = body.charCodeAt(index - 1);
    return index > 0 && code >= 0xd800 && code <= 0xdbff;
  };
  const spans = records(entities)
    .flatMap((entity) => {
      const start = offset(entity.start);
      const end = offset(entity.end);
      return start !== undefined &&
        end !== undefined &&
        start < end &&
        end <= body.length &&
        !splitsPair(start) &&
        !splitsPair(end)
        ? [{ start, end }]
        : [];
    })
    .sort((a, b) => a.start - b.start);
  const parts: PostPart[] = [];
  let at = 0;
  for (const { start, end } of spans) {
    if (start < at) continue;
    if (start > at) parts.push({ text: body.slice(at, start), link: false });
    parts.push({ text: body.slice(start, end), link: true });
    at = end;
  }
  if (at < body.length) parts.push({ text: body.slice(at), link: false });
  return parts;
}

// X's own rule: a date in the current year leaves the year out.
function postDate(value: unknown, now: number) {
  const published = text(value);
  if (!published || Number.isNaN(Date.parse(published))) return undefined;
  return new Date(published).getFullYear() === new Date(now).getFullYear()
    ? dayAndMonth(published)
    : dayMonthYear(published);
}

const verifiedKinds: readonly unknown[] = ["blue", "business", "government"] satisfies Verified[];
const isVerified = (value: unknown): value is Verified => verifiedKinds.includes(value);

function postAuthor(post: Record<string, unknown>, now: number): PostAuthor {
  const handle = text(post.authorHandle)?.replace(/^@/u, "");
  return {
    displayName: text(post.authorName)?.trim() || "X user",
    handle: handle ? `@${handle}` : "@x",
    published: postDate(post.publishedDate, now),
    avatarUrl: assetUrl(text(post.avatarPath)),
    squareAvatar: post.squareAvatar === true,
    verified: isVerified(post.verified) ? post.verified : undefined,
  };
}

function postMedia(value: unknown) {
  return records(value).flatMap((media): PostMedia[] => {
    const url = assetUrl(text(media.path));
    const width = positive(media.width);
    const height = positive(media.height);
    if (!url) return [];
    return [
      {
        kind: media.kind === "video" || media.kind === "gif" ? media.kind : "photo",
        url,
        ratio: width && height ? width / height : 1,
        durationSeconds: positive(media.durationSeconds),
      },
    ];
  });
}

function pollArt(value: unknown): PostArt["poll"] {
  const poll = record(value);
  const choices = records(poll?.choices).flatMap((choice) => {
    const label = text(choice.label)?.trim();
    const votes = typeof choice.votes === "number" && choice.votes >= 0 ? choice.votes : undefined;
    return label ? [{ label, votes }] : [];
  });
  if (!poll || choices.length === 0) return undefined;
  const counted = choices.some((choice) => choice.votes !== undefined);
  const total = choices.reduce((sum, choice) => sum + (choice.votes ?? 0), 0);
  const top = Math.max(...choices.map((choice) => choice.votes ?? 0));
  const final = poll.final === true;
  return {
    choices: choices.map(({ label, votes }) => ({
      label,
      percent: total > 0 ? Math.round(((votes ?? 0) / total) * 100) : undefined,
      winner: final && total > 0 && votes === top,
    })),
    summary: [
      counted && `${total.toLocaleString()} ${total === 1 ? "vote" : "votes"}`,
      final && "Final results",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

function linkCardArt(value: unknown): PostArt["linkCard"] {
  const card = record(value);
  if (!card) return undefined;
  const domain = text(card.domain)?.trim() || hostname(webUrl(text(card.url))) || "";
  const title = text(card.title)?.trim() || domain;
  if (!title) return undefined;
  const width = positive(card.imageWidth);
  const height = positive(card.imageHeight);
  return {
    title,
    domain,
    image: assetUrl(text(card.imagePath)),
    ratio: width && height ? clamp(width / height, 1, 2.2) : 1.91,
    large: card.large !== false,
  };
}

function xPost(value: unknown, now: number) {
  const post = record(value);
  if (!post || post.provider !== "x" || !text(post.postUrl) || !text(post.postId)) return undefined;
  const handle = text(post.authorHandle)?.replace(/^@/u, "");
  const media = postMedia(post.media).slice(0, 4);
  // Not trimmed: entity offsets index the text as stored.
  const stored = text(post.text) ?? "";
  const body =
    stored.trim() || media.length > 0 || post.poll || post.quote
      ? stored
      : "Post preview unavailable.";
  const quote = record(post.quote);
  return {
    handle,
    art: {
      ...postAuthor(post, now),
      body,
      parts: postParts(body, post.entities),
      media: media.length === 1 ? [{ ...media[0], ratio: clamp(media[0].ratio, 0.8, 2) }] : media,
      quote: quote && {
        ...postAuthor(quote, now),
        parts: postParts(text(quote.text) ?? "", quote.entities),
        image: postMedia(quote.media)[0]?.url,
      },
      linkCard: linkCardArt(post.linkCard),
      poll: pollArt(post.poll),
      replyTo: text(record(post.replyTo)?.handle)?.replace(/^@/u, "") || undefined,
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
    label: monthDayStamp(timestamp),
    until: Number.POSITIVE_INFINITY,
  };
}

function archivedLabel(timestamp: number, now: number) {
  const { label, until } = itemDateLabel(timestamp, now);
  return {
    label: `Archived ${until === Number.POSITIVE_INFINITY ? label : label.toLowerCase()}`,
    until,
  };
}

function fallbackRatio(kind: ItemKind) {
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

function treatmentOf(kind: ItemKind, image: string | undefined, isXPost: boolean): Treatment {
  if (isXPost) return "post";
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
      return image ? "media" : "file";
  }
}

function mediaOf(kind: ItemKind, image: string | undefined, isXPost: boolean): MediaKind {
  if (isXPost) return "x-post";
  if (kind === "Video" && image) return "video";
  if (image) return "image";
  return "paper";
}

// The browser holds 4 bytes per pixel for each image it draws, so a card waits for the thumbnail.
const maxDrawnOriginalPixels = 40_000_000;

/** What a card can draw of its own file: the thumbnail, else an original small enough. */
export function cardAsset(
  card: Pick<LibraryCard, "thumbnailPath" | "localAssetPath" | "metadata">,
) {
  if (card.thumbnailPath) return assetUrl(card.thumbnailPath);
  const pixels =
    (positive(card.metadata.mediaWidth) ?? 0) * (positive(card.metadata.mediaHeight) ?? 0);
  return pixels > maxDrawnOriginalPixels ? undefined : assetUrl(card.localAssetPath);
}

function remoteImage(metadata: LibraryCard["metadata"]) {
  const urls = Array.isArray(metadata.imageUrls) ? metadata.imageUrls : [];
  return urls.map((url) => webUrl(text(url))).find((url) => url !== undefined);
}

function remoteDimensions(metadata: LibraryCard["metadata"], url: string | undefined) {
  for (const entry of records(metadata.imageDimensions)) {
    const width = positive(entry.width);
    const height = positive(entry.height);
    if (width && height && (!url || entry.url === url)) return { width, height };
  }
  return undefined;
}

export function toCardView(card: LibraryCard, now = Date.now()): CardView {
  const { metadata } = card;
  const social = xPost(metadata.social, now);
  const baseKind = displayKind(card.kind);
  const video = baseKind === "Article" ? videoLinkFromSourceUrl(card.sourceUrl) : null;
  const kind = itemKind(card.kind, card.sourceUrl, Boolean(social));
  const remote = remoteImage(metadata);
  const image =
    (kind === "Image" ? cardAsset(card) : assetUrl(card.thumbnailPath)) ??
    remote ??
    video?.posterUrl;
  const noPreview = kind === "Image" && !image && Boolean(card.localAssetPath);
  const dimensions = remoteDimensions(metadata, remote);
  const width = positive(metadata.mediaWidth) ?? dimensions?.width;
  const height = positive(metadata.mediaHeight) ?? dimensions?.height;
  const aspectRatio =
    positive(metadata.mediaAspectRatio) ?? (width && height ? width / height : fallbackRatio(kind));
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
    noPreview,
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
    hasLocalFile: Boolean(card.localAssetPath),
    archived: card.archived,
    archivedLabel: card.archived ? archivedLabel(card.updatedAt, now).label : undefined,
    treatment: noPreview ? "media" : treatmentOf(kind, image, Boolean(social)),
    media: mediaOf(kind, image, Boolean(social)),
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
  const until = Math.min(
    itemDateLabel(card.createdAt, now).until,
    card.archived ? archivedLabel(card.updatedAt, now).until : Number.POSITIVE_INFINITY,
  );
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

export function formatDuration(totalSeconds: number) {
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
