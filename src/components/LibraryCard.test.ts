import { describe, expect, test } from "bun:test";
import { cardRectsFor } from "./LibraryCard";

// The overlay's opening flight starts from these rects, captured on click before
// any state changes move the card. Two things have to hold: a card whose media
// box cannot be measured still yields a usable rect, and what comes back is a
// snapshot rather than a live view of the DOM.

type Box = { left: number; top: number; width: number; height: number };

function stubCard(cardBox: Box, mediaBox?: Box) {
  const media = mediaBox
    ? { getBoundingClientRect: () => ({ ...mediaBox }) }
    : null;
  return {
    getBoundingClientRect: () => ({ ...cardBox }),
    querySelector: () => media,
  } as unknown as HTMLElement;
}

describe("cardRectsFor", () => {
  test("returns the card box and the media box", () => {
    const rects = cardRectsFor(
      stubCard({ left: 10, top: 20, width: 210, height: 262 }, { left: 10, top: 20, width: 210, height: 157 }),
    );

    expect(rects.card).toEqual({ left: 10, top: 20, width: 210, height: 262 });
    expect(rects.media).toEqual({ left: 10, top: 20, width: 210, height: 157 });
  });

  test("a card with no measurable media box still yields a rect to fly from", () => {
    // The paper-art cards have no media frame during the first paint. Returning
    // undefined here would leave the overlay flight with nothing to start from.
    const rects = cardRectsFor(stubCard({ left: 4, top: 8, width: 100, height: 120 }));

    expect(rects.media).toEqual({ left: 4, top: 8, width: 100, height: 0 });
  });

  test("copies the numbers rather than holding the live DOMRect", () => {
    // The rects are captured on click and read later, during the animation. If
    // they aliased the element, a re-layout between the two would silently move
    // the flight's origin.
    const cardBox = { left: 1, top: 2, width: 3, height: 4 };
    const card = stubCard(cardBox, { left: 1, top: 2, width: 3, height: 3 });

    const rects = cardRectsFor(card);
    cardBox.left = 999;

    expect(rects.card.left).toBe(1);
    expect(rects.media?.left).toBe(1);
  });
});