import { afterEach, expect, mock, test } from "bun:test";

// The StyleX tokens only exist once the compiler has run, and this test needs none of them.
mock.module("@inkling/ui/tokens.stylex", () => ({
  loadingColor: new Proxy({}, { get: () => "#000000" }),
}));
// No WebGL here, so every cover takes the CPU painter, which must keep its exact pixels.
mock.module("./coverGl.ts", () => ({ paintRingGl: () => false, paintMosaicGl: () => false }));
const { animate, animateUncapped, drawCover, mosaicPhases } = await import("./cardFx.ts");

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

test("the CPU cover painter keeps the pixels it drew before the GPU path", () => {
  const cells = Array.from(
    { length: 108 },
    (_, cell) => [(cell * 37) % 256, (cell * 91) % 256, (cell * 13) % 256] as const,
  );
  // Width, height, progress, ring growth, base: rings (one bare, so its alpha shows), reveals.
  const cases = [
    [161, 200, 0, 1, true],
    [161, 200, 0, 1, false],
    [117, 200, 0, 0.4, true],
    [96, 120, 0.45, 0, true],
    [96, 120, 0.8, 0, false],
    [67, 120, 0.3, 0, true],
  ] as const;
  const hashes = cases.map(([width, height, progress, ring, base]) => {
    const image = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    const mosaic = {
      width,
      height,
      cells,
      phases: mosaicPhases(41),
      image: image as ImageData,
      base,
    };
    const context = { putImageData: () => {} } as unknown as CanvasRenderingContext2D;
    drawCover(context, mosaic, 4012.5, progress, ring);
    return Bun.hash(image.data).toString();
  });
  // Hashes of HEAD's painter before the shared per-cell values, on the same inputs.
  expect(hashes).toEqual([
    "1886056888188265737",
    "6675812159865063836",
    "11209791438584534780",
    "7180392501438503461",
    "14990929219669202463",
    "17255770380923452139",
  ]);
});
