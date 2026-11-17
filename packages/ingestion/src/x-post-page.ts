// Adapted from xeet (https://github.com/rauchg/xeet), Apache-2.0: the payload reading in
// crates/xeet-resolve/src/post.rs and the CDN variant rules in crates/xeet-resolve/src/media.rs.
import type {
  XPostEntity,
  XPostLinkCard,
  XPostMedia,
  XPostMetadata,
  XPostPoll,
  XQuotedPost,
  XVerified,
} from "./types.ts";

type Json = unknown;
type Rich = Omit<XPostMetadata, "provider" | "postUrl" | "postId" | "embedHtml" | "width">;

// X serves its server-rendered payload to a logged-out browser, not to a bot user agent.
export const X_PAGE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
export const X_MEDIA_HOSTS: ReadonlySet<string> = new Set(["pbs.twimg.com"]);

const MAX_MEDIA = 4;

function at(value: Json, ...path: string[]): Json {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, Json>)[key];
  }
  return current;
}
const str = (value: Json) => (typeof value === "string" && value !== "" ? value : undefined);
const num = (value: Json) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
};
const list = (value: Json) => (Array.isArray(value) ? (value as Json[]) : []);
const isObject = (value: Json): value is Record<string, Json> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** `/<handle>/status/<id>` first, which skips the canonical form's redirect, then `/i/status/<id>`. */
export function xPostPageUrls(postId: string, handle: string | undefined) {
  const canonical = `https://x.com/i/status/${postId}`;
  return handle && /^\w{1,15}$/u.test(handle)
    ? [`https://x.com/${handle}/status/${postId}`, canonical]
    : [canonical];
}

// The page embeds each payload as escaped JSON inside a JSON string.
function quotedStringsContaining(html: string, needle: string) {
  const found: string[] = [];
  let index = 0;
  while (index < html.length) {
    if (html[index] !== '"') {
      index++;
      continue;
    }
    let end = index + 1;
    let escaped = false;
    for (; end < html.length; end++) {
      const character = html[end];
      if (character === "\\" && !escaped) {
        escaped = true;
        continue;
      }
      if (character === '"' && !escaped) break;
      escaped = false;
    }
    if (end >= html.length) break;
    const candidate = html.slice(index + 1, end);
    if (candidate.includes(needle)) found.push(candidate);
    index = end + 1;
  }
  return found;
}

function walkTweets(value: Json, out: Record<string, Json>[]) {
  if (Array.isArray(value)) {
    for (const item of value) walkTweets(item, out);
    return;
  }
  if (!isObject(value)) return;
  const fullText = at(value, "details", "full_text");
  if (
    value.__typename === "Tweet" &&
    typeof value.rest_id === "string" &&
    fullText !== undefined &&
    fullText !== null
  )
    out.push(value);
  for (const child of Object.values(value)) walkTweets(child, out);
}

const present = (value: Json) =>
  value !== undefined && value !== null && !(isObject(value) && Object.keys(value).length === 0);

// A page repeats a post in several chunks, some slim (no avatar shape, no badge, or a bare
// stub inside another post's quote slot). The copy that can draw its author wins.
function richness(payload: Json) {
  const text = Array.from(str(at(payload, "details", "full_text")) ?? "").length;
  const note = Array.from(
    str(at(payload, "note_tweet", "note_tweet_results", "result", "text")) ?? "",
  ).length;
  const media = list(at(payload, "media_entities2")).length;
  let score = text + note + media * 64;
  const user = at(payload, "core", "user_results", "result");
  if (present(at(payload, "profile_image_shape")) || present(at(user, "profile_image_shape")))
    score += 512;
  if (present(at(user, "identity_profile_labels_highlighted_label", "label", "description")))
    score += 512;
  if (present(at(user, "avatar", "image_url"))) score += 256;
  if (present(at(user, "verification"))) score += 256;
  if (present(at(user, "core"))) score += 256;
  if (present(at(payload, "counts"))) score += 128;
  return score;
}

function fillMissing(into: Record<string, Json>, from: Record<string, Json>) {
  for (const [key, value] of Object.entries(from)) {
    // The page is untrusted JSON: its `__proto__` key would otherwise merge into Object.prototype.
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const existing = into[key];
    if (existing === undefined || existing === null) into[key] = value;
    else if (isObject(existing) && isObject(value)) fillMissing(existing, value);
  }
}

// The copies are the same post, so this only repairs what a slim chunk dropped.
function mergeMissing(into: Record<string, Json>, from: Record<string, Json>) {
  if (into.profile_image_shape === undefined && from.profile_image_shape !== undefined)
    into.profile_image_shape = from.profile_image_shape;
  const sourceUser = at(from, "core", "user_results", "result");
  if (!isObject(sourceUser)) return;
  const core = isObject(into.core) ? into.core : (into.core = {});
  const results = isObject(core.user_results) ? core.user_results : (core.user_results = {});
  const user = isObject(results.result) ? results.result : (results.result = {});
  fillMissing(user, sourceUser);
}

/** Every post payload the page carries, one per id, each the richest of its copies. */
export function extractXPostPayloads(html: string): Record<string, Json>[] {
  const out: Record<string, Json>[] = [];
  const seen = new Map<string, number>();
  for (const candidate of quotedStringsContaining(html, "full_text")) {
    let value: Json;
    try {
      value = JSON.parse(JSON.parse(`"${candidate}"`) as string);
    } catch {
      continue;
    }
    const found: Record<string, Json>[] = [];
    walkTweets(value, found);
    for (const tweet of found) {
      const id = str(tweet.rest_id);
      if (!id) continue;
      const index = seen.get(id);
      if (index === undefined) {
        seen.set(id, out.length);
        out.push(tweet);
        continue;
      }
      const kept = out[index];
      if (richness(tweet) > richness(kept)) {
        mergeMissing(tweet, kept);
        out[index] = tweet;
      } else mergeMissing(kept, tweet);
    }
  }
  return out;
}

/** Whichever of X's two quote slots carries the real copy; the other is a bare stub. */
function quotePayload(tweet: Json) {
  const quoted = at(tweet, "quoted_tweet_results", "result");
  const nested = at(tweet, "nested_quoted_tweet_results", "result");
  if (isObject(quoted) && isObject(nested))
    return richness(nested) > richness(quoted) ? nested : quoted;
  return isObject(quoted) ? quoted : isObject(nested) ? nested : undefined;
}

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** The payload's text is markup: `&amp;` in it is an ampersand. */
export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/giu, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const code =
        entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : +entity.slice(1);
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
        ? String.fromCodePoint(code)
        : match;
    }
    return namedEntities[entity.toLowerCase()] ?? match;
  });
}

// `display_text_range` counts code points in the logged-out payload, not UTF-16 units.
function displayText(tweet: Json) {
  const full = Array.from(str(at(tweet, "details", "full_text")) ?? "");
  const range = list(at(tweet, "details", "display_text_range"));
  const start = Math.min(Math.max(num(range[0]) ?? 0, 0), full.length);
  const end = Math.min(Math.max(num(range[1]) ?? full.length, start), full.length);
  return full.slice(start, end).join("");
}

type UrlEntity = { short: string; expanded?: string; display?: string };

function urlEntities(tweet: Json): UrlEntity[] {
  const note = at(tweet, "note_tweet", "note_tweet_results", "result", "entity_set");
  return [
    ...list(at(tweet, "url_entities")),
    ...list(at(note, "urls")),
    ...list(at(note, "url_entities")),
  ].flatMap((entry) => {
    const short = str(at(entry, "url"));
    return short
      ? [
          {
            short,
            expanded: str(at(entry, "expanded_url")),
            display: str(at(entry, "display_url")),
          },
        ]
      : [];
  });
}

const tcoPattern = /https?:\/\/t\.co\/[A-Za-z0-9]+/gu;
const mentionPattern = /(?<![\w@＠])[@＠](\w{1,15})(?![\w@＠])/gu;
const hashtagPattern =
  /(?<![\p{L}\p{N}_&#＃/])[#＃]([\p{L}\p{M}\p{N}_]*[\p{L}\p{M}][\p{L}\p{M}\p{N}_]*)/gu;
const cashtagPattern = /(?<![\w$])\$([A-Za-z]{1,6}(?:[._][A-Za-z]{1,2})?)(?!\w)/gu;

/**
 * The post's text as X shows it: t.co links replaced by their display form, and a trailing
 * link to the quoted post or to this post's own media dropped. Entity spans index the result.
 */
export function linkedText(raw: string, urls: UrlEntity[], hidden: (expanded: string) => boolean) {
  const entities: XPostEntity[] = [];
  let text = "";
  let last = 0;
  const source = raw.trimEnd();
  for (const match of source.matchAll(tcoPattern)) {
    const index = match.index;
    const entity = urls.find((candidate) => candidate.short === match[0]);
    const trailing = index + match[0].length === source.length;
    text += source.slice(last, index);
    last = index + match[0].length;
    if (entity?.expanded && trailing && hidden(entity.expanded)) {
      text = text.trimEnd();
      continue;
    }
    const shown = entity?.display ?? entity?.expanded ?? match[0];
    entities.push({
      kind: "url",
      start: text.length,
      end: text.length + shown.length,
      url: entity?.expanded ?? match[0],
    });
    text += shown;
  }
  const joined = text + source.slice(last);
  const leading = joined.length - joined.trimStart().length;
  text = joined.trim();
  const linked = entities.map((entity) => ({
    ...entity,
    start: entity.start - leading,
    end: entity.end - leading,
  }));
  const free = (start: number, end: number) =>
    linked.every((entity) => end <= entity.start || start >= entity.end);
  const tokens: XPostEntity[] = [];
  for (const [pattern, kind] of [
    [mentionPattern, "mention"],
    [hashtagPattern, "hashtag"],
    [cashtagPattern, "cashtag"],
  ] as const) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (free(start, end)) tokens.push({ kind, start, end });
    }
  }
  return {
    text,
    entities: [...linked, ...tokens].sort((a, b) => a.start - b.start),
  };
}

function verifiedOf(user: Json): XVerified | undefined {
  const type = str(at(user, "verification", "verified_type"));
  if (type === "Business") return "business";
  if (type === "Government") return "government";
  return at(user, "verification", "is_blue_verified") === true ? "blue" : undefined;
}

function authorOf(tweet: Json, avatarVariant: string) {
  const user = at(tweet, "core", "user_results", "result");
  const avatar = str(at(user, "avatar", "image_url"));
  const square =
    str(at(user, "profile_image_shape")) === "Square" ||
    str(at(tweet, "profile_image_shape")) === "Square";
  const name = str(at(user, "core", "name"));
  return {
    authorName: name ? decodeEntities(name) : undefined,
    authorHandle: str(at(user, "core", "screen_name")),
    verified: verifiedOf(user),
    avatarUrl: avatar ? avatarVariantUrl(avatar, avatarVariant) : undefined,
    squareAvatar: square || undefined,
  };
}

/** `…/media/ID.jpg` and `small` give `…/media/ID?format=jpg&name=small`; other hosts pass through. */
export function mediaVariantUrl(base: string, variant: string) {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (url.hostname !== "pbs.twimg.com") return base;
  url.pathname = url.pathname.replace(/\.(jpe?g|png|webp)$/iu, "");
  url.searchParams.delete("format");
  url.searchParams.delete("name");
  url.searchParams.set("format", "jpg");
  url.searchParams.set("name", variant);
  return url.toString();
}

const avatarSuffixes = [
  "_normal",
  "_bigger",
  "_mini",
  "_x96",
  "_reasonably_small",
  "_200x200",
  "_400x400",
];

/** A profile image at one of X's own sizes: `_normal` 48, `_x96` 96, `_reasonably_small` 128. */
export function avatarVariantUrl(base: string, variant: string) {
  const match =
    /^(.*?)(_normal|_bigger|_mini|_x96|_reasonably_small|_200x200|_400x400)(\.(?:jpe?g|png|webp))$/iu.exec(
      base,
    );
  if (match && avatarSuffixes.includes(match[2])) return `${match[1]}${variant}${match[3]}`;
  return mediaVariantUrl(
    base,
    variant === "_reasonably_small" ? "128x128" : variant === "_x96" ? "96x96" : "48x48",
  );
}

// A card tile is about 250 CSS px wide: `small` (680w) covers it at 2x, and a 40 px avatar
// is `_x96`. The original is never fetched; `original_info` can be 8192 px wide.
const CARD_MEDIA_VARIANT = "small";
const CARD_AVATAR_VARIANT = "_x96";
const QUOTE_AVATAR_VARIANT = "_normal";

function mediaOf(tweet: Json): XPostMedia[] {
  return list(at(tweet, "media_entities2"))
    .flatMap((entry): XPostMedia[] => {
      const width = num(at(entry, "original_info", "width")) ?? 0;
      const height = num(at(entry, "original_info", "height")) ?? 0;
      const base = str(at(entry, "media_url_https"));
      const url = base && mediaVariantUrl(base, CARD_MEDIA_VARIANT);
      if (!width || !height || !url) return [];
      const type = str(at(entry, "type"));
      const millis = num(at(entry, "video_info", "duration_millis"));
      const alt = str(at(entry, "ext_alt_text"));
      return [
        {
          kind: type === "video" ? "video" : type === "animated_gif" ? "gif" : "photo",
          url,
          width,
          height,
          ...(alt && { alt: decodeEntities(alt) }),
          ...(millis && millis > 0 && { durationSeconds: millis / 1000 }),
        },
      ];
    })
    .slice(0, MAX_MEDIA);
}

// Card binding values arrive as `[{key, value}]` on the page and as a map in other payloads.
function bindingValue(card: Json, key: string): Json {
  const values = at(card, "binding_values");
  if (Array.isArray(values))
    return at(
      values.find((item) => at(item, "key") === key),
      "value",
    );
  return at(values, key);
}
const bindingString = (card: Json, key: string) => {
  const value = str(at(bindingValue(card, key), "string_value"));
  return value ? decodeEntities(value) : undefined;
};

function cardOf(tweet: Json) {
  const legacy = at(tweet, "card", "legacy");
  return isObject(legacy) ? legacy : at(tweet, "card");
}

function pollOf(tweet: Json): XPostPoll | undefined {
  const card = cardOf(tweet);
  if (!str(at(card, "name"))?.startsWith("poll")) return undefined;
  const choices: { label: string; votes: number }[] = [];
  for (let index = 1; index <= 4; index++) {
    const label = bindingString(card, `choice${index}_label`)?.trim();
    if (!label) break;
    choices.push({ label, votes: num(bindingString(card, `choice${index}_count`)) ?? 0 });
  }
  if (choices.length < 2) return undefined;
  const hasVotes = choices.some((choice) => choice.votes > 0);
  const endsAt = bindingString(card, "end_datetime_utc");
  const ends = endsAt ? Date.parse(endsAt) : Number.NaN;
  return {
    choices: hasVotes ? choices : choices.map(({ label }) => ({ label })),
    ...(Number.isFinite(ends) && { endsAt: new Date(ends).toISOString() }),
    final: at(bindingValue(card, "counts_are_final"), "boolean_value") === true,
  };
}

const LINK_CARD_NAMES = new Set(["summary", "summary_large_image", "player"]);
const LARGE_IMAGE_KEYS = [
  "summary_photo_image_large",
  "photo_image_full_size_large",
  "player_image_large",
  "thumbnail_image_large",
];
const SMALL_IMAGE_KEYS = ["thumbnail_image_large", "thumbnail_image", "summary_photo_image_large"];

function linkCardOf(tweet: Json, urls: UrlEntity[]): XPostLinkCard | undefined {
  const card = cardOf(tweet);
  const name = str(at(card, "name"));
  if (!name || !LINK_CARD_NAMES.has(name)) return undefined;
  const short = bindingString(card, "card_url") ?? str(at(card, "url"));
  const url =
    urls.find((entity) => entity.short === short)?.expanded ??
    (short && !/^https?:\/\/t\.co\//u.test(short) ? short : undefined) ??
    urls.at(-1)?.expanded;
  if (!url) return undefined;
  const large = name !== "summary";
  const image = (large ? LARGE_IMAGE_KEYS : SMALL_IMAGE_KEYS)
    .map((key) => at(bindingValue(card, key), "image_value"))
    .find((value) => str(at(value, "url")));
  const imageUrl = image
    ? mediaVariantUrl(str(at(image, "url")) ?? "", CARD_MEDIA_VARIANT)
    : undefined;
  let host: string | undefined;
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  return {
    url,
    domain: bindingString(card, "vanity_url") ?? bindingString(card, "domain") ?? host,
    title: bindingString(card, "title"),
    description: bindingString(card, "description"),
    ...(imageUrl && {
      imageUrl,
      imageWidth: num(at(image, "width")),
      imageHeight: num(at(image, "height")),
    }),
    large,
  };
}

const createdAt = (tweet: Json) => {
  const millis = num(at(tweet, "details", "created_at_ms"));
  return millis === undefined ? undefined : new Date(millis).toISOString();
};

const statusUrl = (id: string, handle: string | undefined) =>
  handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/status/${id}`;

// A long post carries its whole text as a note; the library keeps all of it so search finds
// every word, and the card clamps it instead of using X's cut.
function postText(tweet: Json) {
  const note = str(at(tweet, "note_tweet", "note_tweet_results", "result", "text"));
  return decodeEntities(note ?? displayText(tweet));
}

function textAndEntities(tweet: Json, hidden: (expanded: string) => boolean) {
  const { text, entities } = linkedText(postText(tweet), urlEntities(tweet), hidden);
  return { text, ...(entities.length > 0 && { entities }) };
}

const pointsAt =
  (id: string | undefined, media = false) =>
  (expanded: string) => {
    if (!id) return false;
    const path = media ? `/status/${id}/(?:photo|video)/` : `/status/${id}(?:[/?#]|$)`;
    return new RegExp(`^https://(?:[\\w-]+\\.)?(?:x|twitter)\\.com/[^/]+${path}`, "iu").test(
      expanded,
    );
  };

function quotedPost(tweet: Json): XQuotedPost | undefined {
  const quoted = quotePayload(tweet);
  const id = str(at(quoted, "rest_id"));
  if (!quoted || !id) return undefined;
  const author = authorOf(quoted, QUOTE_AVATAR_VARIANT);
  const media = mediaOf(quoted);
  return {
    postId: id,
    postUrl: statusUrl(id, author.authorHandle),
    ...author,
    ...textAndEntities(quoted, pointsAt(id, true)),
    ...(media.length > 0 && { media }),
    publishedDate: createdAt(quoted) ?? null,
  };
}

/** The rich fields of the post `postId` from its page's HTML, or null when the page lacks it. */
export function xPostFromPage(html: string, postId: string): Rich | null {
  const tweet = extractXPostPayloads(html).find((payload) => payload.rest_id === postId);
  if (!tweet) return null;
  const quote = quotedPost(tweet);
  const hidden = (expanded: string) =>
    pointsAt(postId, true)(expanded) || pointsAt(quote?.postId)(expanded);
  const media = mediaOf(tweet);
  const urls = urlEntities(tweet);
  const linkCard = media.length === 0 && !quote ? linkCardOf(tweet, urls) : undefined;
  const poll = pollOf(tweet);
  const replyId =
    str(at(tweet, "reply_to_results", "rest_id")) ??
    str(at(tweet, "details", "in_reply_to_status_id_str"));
  const replyHandle =
    str(at(tweet, "reply_to_user_results", "result", "core", "screen_name")) ??
    str(at(tweet, "details", "in_reply_to_screen_name"));
  const author = authorOf(tweet, CARD_AVATAR_VARIANT);
  return {
    ...author,
    ...(author.authorHandle && { authorUrl: `https://x.com/${author.authorHandle}` }),
    ...textAndEntities(tweet, hidden),
    publishedDate: createdAt(tweet) ?? null,
    ...(media.length > 0 && { media }),
    ...(quote && { quote }),
    ...(linkCard && { linkCard }),
    ...(poll && { poll }),
    ...((replyId || replyHandle) && {
      replyTo: { ...(replyId && { postId: replyId }), ...(replyHandle && { handle: replyHandle }) },
    }),
  };
}

/** The words search should find for a post: its text, its quote, its link card, poll and alt text. */
export function xPostSearchText(post: XPostMetadata) {
  const quote = post.quote;
  return [
    post.text,
    ...(post.media ?? []).map((media) => media.alt),
    quote &&
      [quote.authorName, quote.authorHandle && `@${quote.authorHandle}`, quote.text]
        .filter(Boolean)
        .join(" "),
    ...(quote?.media ?? []).map((media) => media.alt),
    post.linkCard &&
      [post.linkCard.title, post.linkCard.description, post.linkCard.domain]
        .filter(Boolean)
        .join(" "),
    ...(post.poll?.choices ?? []).map((choice) => choice.label),
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n");
}
