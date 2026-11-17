import { downloadImage, runHttp } from "./http.ts";
import type { LookupHost } from "./public-host.ts";
import { X_MEDIA_HOSTS } from "./x-post-page.ts";
import type { XPostMetadata } from "./types.ts";

// A `small` variant is under 200 KB; anything near this cap is not what was asked for.
const MAX_X_IMAGE_BYTES = 5 * 1024 * 1024;
const X_IMAGE_TIMEOUT_MS = 15_000;

/** One picture a saved post shows, named by where it sits so a retry overwrites, not duplicates. */
export type XPostMediaSlot = { slot: string; url: string };

export const X_MEDIA_SLOT = /^(?:avatar|media-[0-3]|quote-avatar|quote-media-[0-3]|card)$/u;

/** The post's pictures that have no library copy yet. */
export function missingXPostMedia(social: XPostMetadata): XPostMediaSlot[] {
  const slots: (XPostMediaSlot | null)[] = [
    social.avatarUrl && !social.avatarPath ? { slot: "avatar", url: social.avatarUrl } : null,
    ...(social.media ?? []).map((media, index) =>
      media.path ? null : { slot: `media-${index}`, url: media.url },
    ),
    social.quote?.avatarUrl && !social.quote.avatarPath
      ? { slot: "quote-avatar", url: social.quote.avatarUrl }
      : null,
    ...(social.quote?.media ?? []).map((media, index) =>
      media.path ? null : { slot: `quote-media-${index}`, url: media.url },
    ),
    social.linkCard?.imageUrl && !social.linkCard.imagePath
      ? { slot: "card", url: social.linkCard.imageUrl }
      : null,
  ];
  return slots.filter(
    (slot): slot is XPostMediaSlot => slot !== null && X_MEDIA_SLOT.test(slot.slot),
  );
}

/**
 * The post with each stored copy's path recorded, where the slot still shows the URL that
 * was downloaded; a slot whose picture changed meanwhile keeps waiting for its own.
 */
export function withXPostMediaPaths(
  social: XPostMetadata,
  stored: ReadonlyMap<string, { url: string; path: string }>,
): XPostMetadata {
  const pathFor = (slot: string, url: string | undefined) => {
    const copy = stored.get(slot);
    return copy && copy.url === url ? copy.path : undefined;
  };
  const media = (list: XPostMetadata["media"], prefix: string) =>
    list?.map((entry, index) => {
      const path = pathFor(`${prefix}${index}`, entry.url);
      return path ? { ...entry, path } : entry;
    });
  const avatarPath = pathFor("avatar", social.avatarUrl);
  const quoteAvatarPath = pathFor("quote-avatar", social.quote?.avatarUrl);
  const cardPath = pathFor("card", social.linkCard?.imageUrl);
  return {
    ...social,
    ...(avatarPath && { avatarPath }),
    ...(social.media && { media: media(social.media, "media-") }),
    ...(social.quote && {
      quote: {
        ...social.quote,
        ...(quoteAvatarPath && { avatarPath: quoteAvatarPath }),
        ...(social.quote.media && { media: media(social.quote.media, "quote-media-") }),
      },
    }),
    ...(social.linkCard && {
      linkCard: { ...social.linkCard, ...(cardPath && { imagePath: cardPath }) },
    }),
  };
}

/** The file extension the bytes' own header names, or null when they are not a card image. */
export function imageExtension(bytes: Uint8Array) {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts(0xff, 0xd8, 0xff)) return "jpg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[8 + index] === byte)
  )
    return "webp";
  return null;
}

/** A picture from X's image CDN, or null when it answers with anything but an image. */
export async function downloadXPostImage(
  url: string,
  options: { fetch?: typeof globalThis.fetch; lookupHost?: LookupHost } = {},
) {
  const bytes = await runHttp(
    downloadImage(url, {
      timeoutMs: X_IMAGE_TIMEOUT_MS,
      maxBytes: MAX_X_IMAGE_BYTES,
      lookupHost: options.lookupHost,
      allowedHosts: X_MEDIA_HOSTS,
    }),
    options.fetch,
  );
  return bytes && imageExtension(bytes) ? bytes : null;
}
