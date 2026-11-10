import { afterEach, expect, mock, test } from "bun:test";

// The StyleX tokens only exist once the compiler has run, and this test needs none of them.
mock.module("@inkling/ui/tokens.stylex", () => ({
  loadingColor: new Proxy({}, { get: () => "#000000" }),
}));
const { animate, animateUncapped } = await import("./cardFx.ts");

const original = Object.fromEntries(
  ["matchMedia", "requestAnimationFrame"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
afterEach(() => {
  for (const [key, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("the liquid bar runs past the eight-canvas cap and still stops under reduced motion", () => {
  Object.assign(globalThis, {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: () => 1,
  });
  const cards = Array.from({ length: 8 }, () => animate(() => {}));
  expect(cards.every((card) => card.animated)).toBe(true);
  expect(animate(() => {}).animated).toBe(false);

  const liquid = animateUncapped(() => {});
  expect(liquid.animated).toBe(true);
  liquid.stop();
  for (const card of cards) card.stop();

  Object.assign(globalThis, { matchMedia: () => ({ matches: true }) });
  expect(animateUncapped(() => {}).animated).toBe(false);
});
