import { expect, test } from "bun:test";
import { hasThumbnail, retainThumbnail, takeThumbnail } from "./thumbnailCache.ts";

function image(url: string, connected = false, width = 100, height = 100) {
  return {
    src: url,
    currentSrc: url,
    complete: true,
    naturalWidth: width,
    naturalHeight: height,
    isConnected: connected,
  } as HTMLImageElement;
}

test("a remounted media cell leases its original decoded node exactly once", () => {
  const url = "app://cache-test/retained";
  const original = image(url);
  retainThumbnail(original);
  expect(hasThumbnail(url)).toBe(true);
  expect(takeThumbnail(url)).toBe(original);
  expect(takeThumbnail(url)).toBeUndefined();
  retainThumbnail(original);
  expect(takeThumbnail(url)).toBe(original);
});

test("a duplicate visible item cannot steal another cell's connected image", () => {
  const url = "app://cache-test/connected";
  const original = image(url, true);
  retainThumbnail(original);
  expect(takeThumbnail(url)).toBeUndefined();
  expect(hasThumbnail(url)).toBe(true);
  Object.defineProperty(original, "isConnected", { value: false });
  expect(takeThumbnail(url)).toBe(original);
});

test("node reuse keeps the existing count, pixel and readiness bounds", () => {
  const incomplete = image("app://cache-test/incomplete");
  Object.defineProperty(incomplete, "complete", { value: false });
  retainThumbnail(incomplete);
  expect(takeThumbnail(incomplete.src)).toBeUndefined();
  const oversized = image("app://cache-test/oversized", false, 5000, 5000);
  retainThumbnail(oversized);
  expect(takeThumbnail(oversized.src)).toBeUndefined();
  for (let i = 0; i < 33; i++) retainThumbnail(image(`app://cache-test/bounded-${i}`));
  expect(takeThumbnail("app://cache-test/bounded-0")).toBeUndefined();
  expect(takeThumbnail("app://cache-test/bounded-32")).toBeDefined();
});
