import { describe, expect, test } from "bun:test";
import { Virtualizer } from "@tanstack/react-virtual";
import { relayoutLanes } from "./masonryLanes.ts";

const lanes = 4;
const tallest = 460;
// Card heights from 180 to 460 px, fixed per id so a card keeps its size wherever it moves.
const height = (id: string) =>
  180 + ([...id].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) % 9) * 35;
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
const ids = (from: number, to: number) => range(from, to).map((index) => `item-${index}`);

/** The Grid's virtualizer with the cards at `measured` positions measured in that order. */
function grid(initial: string[], measured = range(0, initial.length)) {
  let list = initial;
  const options = () => ({
    count: list.length,
    getItemKey: (index: number) => list[index],
    estimateSize: () => 300,
    lanes,
    laneAssignmentMode: "measured" as const,
    getScrollElement: () => null,
    observeElementRect: () => () => {},
    observeElementOffset: () => () => {},
    scrollToFn: () => {},
  });
  const virtualizer = new Virtualizer<Element, Element>(options());
  const measure = (indexes: number[]) =>
    indexes.forEach((index) => {
      virtualizer.getTotalSize();
      virtualizer.resizeItem(index, height(list[index]));
    });
  measure(measured);
  return {
    show(next: string[]) {
      const previous = list;
      list = next;
      virtualizer.setOptions(options());
      relayoutLanes(virtualizer, previous, next);
      measure(range(0, next.length));
    },
    lanes: () => new Map(virtualizer.measurementsCache.map((item) => [item.key, item.lane])),
    spread() {
      const ends = Array.from({ length: lanes }, () => 0);
      for (const item of virtualizer.measurementsCache)
        ends[item.lane] = Math.max(ends[item.lane], item.end);
      return Math.max(...ends) - Math.min(...ends);
    },
  };
}

describe("masonry lanes", () => {
  // Cards that arrive off screen take a lane by their estimated height until they scroll
  // in, so ten of them can leave the columns up to about two cards apart.
  test.each([
    ["a card captured on top", ["new", ...ids(0, 400)], tallest],
    ["ten cards captured on top", [...ids(1000, 1010), ...ids(0, 400)], 2 * tallest],
    ["a card restored into the middle", [...ids(0, 200), "restored", ...ids(200, 400)], tallest],
    ["a card archived from the middle", [...ids(0, 150), ...ids(151, 400)], tallest],
    ["a Smart Space reading fewer in place", ids(0, 400).filter((_, i) => i % 3 === 0), tallest],
  ])("%s keeps the columns balanced", (_, next, bound) => {
    const view = grid(ids(0, 400));
    view.show(next);
    expect(view.spread()).toBeLessThanOrEqual(bound);
  });

  // Scrolled to the end, then back to the top: the later cards took their lanes while the
  // earlier ones were still estimates, and a fresh layout would move them.
  test("the next page keeps every card in its column", () => {
    const measured = [...range(300, 400), ...range(0, 100)];
    const view = grid(ids(0, 400), measured);
    const before = view.lanes();
    view.show(ids(0, 500));
    const after = view.lanes();
    for (const id of measured.map((index) => `item-${index}`))
      expect(after.get(id)).toBe(before.get(id));
  });
});
