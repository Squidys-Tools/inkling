// Keep decoded images across virtual-cell remounts, bounded by count and pixels.
const held = new Map<string, HTMLImageElement>();
const pending = new Set<string>();
const maxPixels = 16_000_000;
export const hasThumbnail = (url: string) => held.has(url);

export function retainThumbnail(image: HTMLImageElement) {
  if (!image.complete || !image.naturalWidth) return;
  const url = image.currentSrc || image.src;
  held.delete(url);
  held.set(url, image);
  let pixels = [...held.values()].reduce(
    (sum, value) => sum + value.naturalWidth * value.naturalHeight,
    0,
  );
  while (held.size > 32 || pixels > maxPixels) {
    const first = held.entries().next().value;
    if (!first) break;
    held.delete(first[0]);
    pixels -= first[1].naturalWidth * first[1].naturalHeight;
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
