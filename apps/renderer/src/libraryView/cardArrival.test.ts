import { afterEach, expect, test } from "bun:test";
import { animateArrival, entranceDelay, inViewport } from "./cardArrival.ts";

const original = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "matchMedia", original);
  else Reflect.deleteProperty(globalThis, "matchMedia");
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function animation() {
  let finish!: () => void;
  const cancelled: true[] = [];
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { finished, finish, cancelled, cancel: () => cancelled.push(true) };
}
function fixture(reduced = false) {
  const first = animation();
  const rect = { top: 0, bottom: 800, left: 0, width: 1000, height: 800 };
  const cards = [first, animation()].map((value, index) => ({
    getBoundingClientRect: () => ({ ...rect, top: index * 300 }),
    animate: () => value,
  }));
  const grid = {
    parentElement: { getBoundingClientRect: () => rect },
    querySelectorAll: () => cards,
  };
  Object.assign(globalThis, { matchMedia: () => ({ matches: reduced }) });
  return { first, grid: grid as unknown as HTMLElement };
}

test("entrance stagger is bounded", () => {
  expect(entranceDelay(0, 0)).toBe(0);
  expect(entranceDelay(20, 20)).toBe(160);
  expect(entranceDelay(-1, -1)).toBe(0);
});
test("only intersecting cards animate", () => {
  const view = { top: 100, bottom: 800 };
  expect(inViewport({ top: 40, bottom: 140 }, view)).toBe(true);
  expect(inViewport({ top: 800, bottom: 900 }, view)).toBe(false);
  expect(inViewport({ top: 0, bottom: 100 }, view)).toBe(false);
});
test("arrivals release finished animations", async () => {
  const { grid, first } = fixture();
  expect(animateArrival(grid)).toHaveLength(2);
  first.finish();
  await settle();
  expect(first.cancelled).toEqual([true]);
});
test("reduced motion schedules no animations", () => {
  expect(animateArrival(fixture(true).grid)).toEqual([]);
});
