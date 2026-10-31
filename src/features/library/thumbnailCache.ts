import type { LibraryItem } from "../../lib/types";

// Warm only core-generated thumbnails, never the original/remote fallback.
// At most four decodes, 24 queued URLs, and 16 MiB of retained RGBA pixels.
const maxBytes = 16 * 1024 * 1024;
const thumbnails = new Map<string, { image: HTMLImageElement; bytes: number }>();
const pending = new Set<string>();
let retainedBytes = 0;
let queue: string[] = [];
let active = 0;
function drain() {
  while (active < 4 && queue.length) {
    const src = queue.shift()!;
    if (thumbnails.has(src) || pending.has(src)) continue;
    const image = new Image();
    image.decoding = "async";
    pending.add(src);
    active += 1;
    image.src = src;
    void image
      .decode()
      .then(() => {
        if (
          image.naturalWidth < 1 ||
          image.naturalHeight < 1 ||
          image.naturalWidth > 512 ||
          image.naturalHeight > 512
        )
          return;
        const bytes = image.naturalWidth * image.naturalHeight * 4;
        thumbnails.set(src, { image, bytes });
        retainedBytes += bytes;
        while (retainedBytes > maxBytes) {
          const oldest = thumbnails.keys().next().value!;
          retainedBytes -= thumbnails.get(oldest)!.bytes;
          thumbnails.delete(oldest);
        }
      })
      .catch(() => {
        // Best-effort only: failed decodes are not retained and a later warm can retry.
      })
      .finally(() => {
        pending.delete(src);
        active -= 1;
        drain();
      });
  }
}
export function warmThumbnails(items: LibraryItem[]) {
  // Browser previews keep normal image loading; this is a desktop asset cache.
  if (location.protocol !== "app:") return;
  queue = items.slice(0, 24).flatMap((item) => {
    if (!item.thumbnailUrl) return [];
    try {
      const url = new URL(item.thumbnailUrl, location.href);
      return url.protocol === "app:" && url.host === location.host ? [item.thumbnailUrl] : [];
    } catch {
      return [];
    }
  });
  drain();
}
