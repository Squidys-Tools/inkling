import { afterEach, expect, test } from "bun:test";
import { animateArrival, entranceDelay, inViewport, switchView } from "./viewTransition.ts";
import { setEntering, setListMode, viewState } from "./viewState.ts";

const original = Object.fromEntries(
  ["document", "matchMedia", "getComputedStyle", "requestAnimationFrame"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
afterEach(() => {
  setEntering(false);
  setListMode(false);
  for (const [key, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function animation() {
  let finish!: () => void;
  const cancelled: boolean[] = [];
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { finished, finish, cancelled, cancel: () => cancelled.push(viewState.get().entering) };
}
function fixture(reduced = false) {
  const first = animation(),
    last = animation(),
    fade = animation(),
    frames: FrameRequestCallback[] = [];
  const rect = { top: 0, bottom: 800, left: 0, width: 1000, height: 800 };
  const cards = [first, last].map((value, index) => ({
    getBoundingClientRect: () => ({ ...rect, top: index * 300 }),
    animate: () => value,
  }));
  const grid = {
    parentElement: { getBoundingClientRect: () => rect },
    querySelectorAll: () => cards,
    querySelector: () => cards[0],
    animate: () => fade,
  };
  Object.assign(globalThis, {
    matchMedia: () => ({ matches: reduced }),
    document: { querySelector: () => grid },
    getComputedStyle: () => ({ opacity: "1" }),
    requestAnimationFrame: (callback: FrameRequestCallback) => (
      frames.push(callback),
      frames.length
    ),
  });
  return { first, last, fade, frames, grid: grid as unknown as HTMLElement };
}

test("entrance stagger is bounded for list and grid", () => {
  for (const list of [false, true]) {
    expect(entranceDelay(list, 0, 0)).toBe(0);
    expect(entranceDelay(list, 20, 20)).toBe(160);
    expect(entranceDelay(list, -1, -1)).toBe(0);
  }
});
test("only intersecting cards animate", () => {
  const view = { top: 100, bottom: 800 };
  expect(inViewport({ top: 40, bottom: 140 }, view)).toBe(true);
  expect(inViewport({ top: 800, bottom: 900 }, view)).toBe(false);
  expect(inViewport({ top: 0, bottom: 100 }, view)).toBe(false);
});
test("early cards hold their fill until group CSS is committed visible", async () => {
  const { first, last, fade, frames } = fixture();
  switchView(true);
  fade.finish();
  await settle();
  for (let n = 0; n < 3; n++) frames.shift()!(n * 16);
  expect(viewState.get().entering).toBe(true);
  first.finish();
  await settle();
  expect(first.cancelled).toEqual([]);
  expect(viewState.get().entering).toBe(true);
  last.finish();
  await settle();
  expect(first.cancelled).toEqual([false]);
  expect(last.cancelled).toEqual([false]);
  expect(viewState.get()).toMatchObject({ entering: false, list: true });
});
test("standalone arrivals still release finished animations", async () => {
  const { grid, first } = fixture();
  animateArrival(grid, false);
  first.finish();
  await settle();
  expect(first.cancelled).toEqual([false]);
});
test("reduced motion changes layout without hiding cards or scheduling animations", () => {
  const { grid, fade, frames } = fixture(true);
  expect(animateArrival(grid, false)).toEqual([]);
  switchView(true);
  expect(viewState.get()).toMatchObject({ list: true, entering: false });
  expect(frames).toHaveLength(0);
  expect(fade.cancelled).toHaveLength(0);
});
