import type { Virtualizer } from "@tanstack/react-virtual";

/**
 * The virtualizer keeps each card's lane by list position, which only holds while the
 * list grows at its end. After any other change (a capture on top, a restore, a Smart
 * Space reading again) the old lanes would hold other cards and the columns drift apart
 * by thousands of pixels, so the lanes are laid out again from the sizes already measured.
 */
export function relayoutLanes(
  virtualizer: Pick<Virtualizer<Element, Element>, "measure" | "itemSizeCache">,
  previous: readonly string[],
  next: readonly string[],
) {
  if (next.length >= previous.length && previous.every((id, index) => next[index] === id)) return;
  const sizes = [...virtualizer.itemSizeCache];
  // measure() forgets the lanes and the sizes together; the sizes are keyed by id and still hold.
  virtualizer.measure();
  for (const [key, size] of sizes) virtualizer.itemSizeCache.set(key, size);
}
