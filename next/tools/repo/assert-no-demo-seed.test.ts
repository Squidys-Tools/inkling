import { describe, expect, test } from "bun:test";
import { findSeedLeaks } from "./assert-no-demo-seed.ts";

const reading = (contents: Record<string, string>) => (path: string) => contents[path] ?? "";

describe("findSeedLeaks", () => {
  test("flags copied seed files and every bundle that names one", () => {
    const files = [
      "dist/renderer/assets/compressO-IMG_2618-abc.jpg",
      "dist/renderer/assets/saved-clip-abc.mp4",
      "dist/renderer/assets/client-abc.js",
      "dist/renderer/assets/index-abc.css",
      "dist/desktop/main.mjs",
    ];
    const read = reading({
      "dist/renderer/assets/client-abc.js": 'const s="./compressO-IMG_2618-abc.jpg";',
      "dist/renderer/assets/index-abc.css": 'body{background:url("seed-demo/a.jpg")}',
      "dist/desktop/main.mjs": 'const clip="saved-clip.mp4";',
    });
    expect(findSeedLeaks(files, read).map((finding) => finding.path)).toEqual(files);
  });

  test("passes a clean build", () => {
    const files = ["dist/renderer/index.html", "dist/renderer/assets/index-abc123.js"];
    expect(findSeedLeaks(files, () => "console.log('inkling')")).toEqual([]);
  });

  test("ignores a file whose name only contains a marker", () => {
    expect(findSeedLeaks(["dist/renderer/assets/no-seed-demo.js"], () => "")).toEqual([]);
  });
});
