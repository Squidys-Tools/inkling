import { describe, expect, test } from "bun:test";
import { buildTree, type Cell, measureTree, MORPH, orderByDetail } from "./gridRevealTree.ts";

const leaves = (cell: Cell): Cell[] => (cell.kids ? cell.kids.flatMap(leaves) : [cell]);

describe("grid reveal tree", () => {
  test("splits into 180 cells that tile the frame, the first three already apart", () => {
    const { root, branches } = buildTree(264 / 308);
    const cells = leaves(root);
    expect(cells).toHaveLength(180);
    expect(cells.reduce((sum, cell) => sum + cell.w * cell.h, 0)).toBeCloseTo(1, 9);
    expect(branches.slice(0, 3).every((cell) => cell.splitAt === -MORPH)).toBe(true);
    const later = branches.slice(3).map((cell) => cell.splitAt);
    expect(later).toEqual([...later].sort((a, b) => a - b));
    expect(later.at(-1)).toBeCloseTo(0.92, 9);
  });

  test("reordering by detail reuses the time slots and never splits a child before its parent", () => {
    const { root, branches } = buildTree(1);
    const size = 32;
    const pixels = new Uint8ClampedArray(size * size * 4);
    // Detail only in the right half: a checkerboard there, flat grey on the left.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = x >= size / 2 && (x + y) % 2 === 0 ? 255 : 90;
        pixels.set([v, v, v, 255], (y * size + x) * 4);
      }
    }
    const openedBefore = 0.2;
    const slotsBefore = branches.map((cell) => cell.splitAt).sort((a, b) => a - b);
    measureTree(root, pixels, size);
    orderByDetail(branches, openedBefore);

    expect(branches.map((cell) => cell.splitAt).sort((a, b) => a - b)).toEqual(slotsBefore);
    for (const cell of branches) {
      if (cell.parent) expect(cell.splitAt).toBeGreaterThanOrEqual(cell.parent.splitAt);
    }
    const pending = branches.filter((cell) => cell.splitAt > openedBefore);
    const next = pending.reduce((a, b) => (b.splitAt < a.splitAt ? b : a));
    expect(next.x + next.w / 2).toBeGreaterThan(0.5);
  });
});
