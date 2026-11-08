// Keep decoded images across virtual-cell remounts, bounded by count and pixels.
const held = new Map<string, { image: HTMLImageElement; pixels: number }>();
const pending = new Set<string>();
const maxImages = 32;
const maxPixels = 16_000_000;
let heldPixels = 0;
export const hasThumbnail = (url: string) => held.has(url);

function release(url: string) {
  const entry = held.get(url);
  if (!entry) return undefined;
  held.delete(url);
  heldPixels -= entry.pixels;
  return entry.image;
}

/** Lease the actual decoded node only after its previous cell released it. */
export function takeThumbnail(url: string) {
  const entry = held.get(url);
  if (!entry || entry.image.isConnected) return undefined;
  return release(url);
}

export function retainThumbnail(image: HTMLImageElement) {
  if (!image.complete || !image.naturalWidth) return;
  const url = image.currentSrc || image.src;
  release(url);
  const pixels = image.naturalWidth * image.naturalHeight;
  held.set(url, { image, pixels });
  heldPixels += pixels;
  while (held.size > maxImages || heldPixels > maxPixels) {
    const first = held.keys().next();
    if (first.done) break;
    release(first.value);
  }
}

export function warmThumbnail(url: string) {
  if (held.has(url) || pending.has(url) || pending.size >= 4) return;
  pending.add(url);
  const image = new Image();
  image.src = url;
  void image
    .decode()
    .then(
      () => retainThumbnail(image),
      () => {},
    )
    .finally(() => pending.delete(url));
}
