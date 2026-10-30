import { canvasImageCrossOrigin } from "../../components/LiquidGlass";
import type { LibraryItem } from "../../lib/types";

// Keep a small decoded working set; never warm remote art or start an unbounded decode queue.
const thumbnails = new Map<string, HTMLImageElement>();
const pending = new Set<string>();
let queue: string[] = [];
let active = 0;
function drain() {
  while (active < 4 && queue.length) {
    const src = queue.shift()!;
    if (thumbnails.has(src) || pending.has(src)) continue;
    const image = new Image();
    image.decoding = "async";
    const crossOrigin = canvasImageCrossOrigin(src);
    if (crossOrigin) image.crossOrigin = crossOrigin;
    pending.add(src);
    active += 1;
    image.src = src;
    void image
      .decode()
      .then(() => {
        thumbnails.set(src, image);
        if (thumbnails.size > 64) thumbnails.delete(thumbnails.keys().next().value!);
      })
      .catch(() => {})
      .finally(() => {
        pending.delete(src);
        active -= 1;
        drain();
      });
  }
}
export function warmThumbnails(items: LibraryItem[]) {
  queue = items.slice(0, 24).flatMap((item) => {
    if (!item.image) return [];
    try {
      const url = new URL(item.image, location.href);
      return url.protocol === location.protocol &&
        url.host === location.host &&
        (url.protocol === "app:" || /^https?:$/.test(url.protocol))
        ? [item.image]
        : [];
    } catch {
      return [];
    }
  });
  drain();
}
