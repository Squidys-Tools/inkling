// The cell tree behind GridReveal, adapted from Rare UI's Grid Reveal.

const CELLS = 180;
const OPENING_CELLS = 4;
const LAST_SPLIT = 0.92;
// how long one cell takes to separate, in progress units
export const MORPH = 0.055;

export type Cell = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  g: number;
  b: number;
  tone: number;
  detail: number;
  splitAt: number;
  parent: Cell | null;
  kids: [Cell, Cell] | null;
};

type Sums = { n: number; r: number; g: number; b: number; l: number; l2: number };

function hash(x: number, y: number, z: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function makeCell(x: number, y: number, w: number, h: number, parent: Cell | null): Cell {
  return {
    x,
    y,
    w,
    h,
    r: 0,
    g: 0,
    b: 0,
    tone: hash(x + 3.1, y + 1.7, w * 31.7),
    detail: 0,
    splitAt: 0,
    parent,
    kids: null,
  };
}

// splitting the biggest cell each time keeps cells square and the count rising one at a time
export function buildTree(aspect: number) {
  const root = makeCell(0, 0, 1, 1, null);
  const leaves: Cell[] = [root];
  const branches: Cell[] = [];

  while (leaves.length < CELLS) {
    let pick = 0;
    let widest = -1;
    for (let i = 0; i < leaves.length; i++) {
      const c = leaves[i];
      // the jitter only breaks ties between cells of equal size
      const area = c.w * aspect * c.h * (1 + 0.12 * hash(c.x, c.y, 7.3));
      if (area > widest) {
        widest = area;
        pick = i;
      }
    }

    const parent = leaves.splice(pick, 1)[0];
    const wide = parent.w * aspect >= parent.h;
    const half = wide ? parent.w / 2 : parent.h / 2;
    const a = wide
      ? makeCell(parent.x, parent.y, half, parent.h, parent)
      : makeCell(parent.x, parent.y, parent.w, half, parent);
    const b = wide
      ? makeCell(parent.x + half, parent.y, half, parent.h, parent)
      : makeCell(parent.x, parent.y + half, parent.w, half, parent);

    parent.kids = [a, b];
    branches.push(parent);
    leaves.push(a, b);
  }

  const opening = OPENING_CELLS - 1;
  const rest = Math.max(1, branches.length - opening);
  // the opening splits sit before zero so those cells are already apart on frame one
  branches.forEach((cell, i) => {
    cell.splitAt = i < opening ? -MORPH : (LAST_SPLIT * (i - opening + 1)) / rest;
  });

  return { root, branches };
}
// average colour per cell, plus the luminance spread that decides what splits first
export function measureTree(root: Cell, pixels: Uint8ClampedArray, size: number) {
  const gather = (cell: Cell): Sums => {
    let s: Sums;
    if (cell.kids) {
      const a = gather(cell.kids[0]);
      const b = gather(cell.kids[1]);
      s = { n: a.n + b.n, r: a.r + b.r, g: a.g + b.g, b: a.b + b.b, l: a.l + b.l, l2: a.l2 + b.l2 };
    } else {
      s = { n: 0, r: 0, g: 0, b: 0, l: 0, l2: 0 };
      const x0 = Math.round(cell.x * size);
      const y0 = Math.round(cell.y * size);
      const x1 = Math.max(x0 + 1, Math.round((cell.x + cell.w) * size));
      const y1 = Math.max(y0 + 1, Math.round((cell.y + cell.h) * size));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * size + x) * 4;
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          s.n++;
          s.r += r;
          s.g += g;
          s.b += b;
          s.l += l;
          s.l2 += l * l;
        }
      }
    }
    const n = s.n || 1;
    cell.r = s.r / n;
    cell.g = s.g / n;
    cell.b = s.b / n;
    cell.detail = Math.max(0, s.l2 / n - (s.l / n) * (s.l / n));
    return s;
  };
  gather(root);
}

// reuse the same time slots so only the order changes and the pacing stays identical
export function orderByDetail(branches: Cell[], openedBefore: number) {
  const pending = branches.filter((c) => c.splitAt > openedBefore);
  if (pending.length < 2) return;

  const slots = pending.map((c) => c.splitAt).sort((a, b) => a - b);
  const queue = pending.filter((c) => !c.parent || c.parent.splitAt <= openedBefore);

  let next = 0;
  while (queue.length && next < slots.length) {
    let pick = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].detail > queue[pick].detail) pick = i;
    }
    const cell = queue.splice(pick, 1)[0];
    cell.splitAt = slots[next++];
    for (const kid of cell.kids ?? []) {
      if (kid.kids) queue.push(kid);
    }
  }
}
