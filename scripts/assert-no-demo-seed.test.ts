import { describe, expect, test } from "bun:test";
import { findSeedLeaks } from "./assert-no-demo-seed";

const reading = (contents: Record<string, string>) => (path: string) => contents[path] ?? "";

describe("findSeedLeaks", () => {
  test("flags copied seed assets and every bundle that references the seed path", () => {
    const files = ["seed-demo", "seed-demo/a.jpg", "assets/index-abc.js", "assets/index-abc.css"];
    const read = reading({
      "assets/index-abc.js": 'const s="/seed-demo/photo.jpg";',
      "assets/index-abc.css": 'body{background:url("/seed-demo/a.jpg")}',
    });
    expect(findSeedLeaks(files, read).map((finding) => finding.path)).toEqual([
      "seed-demo",
      "assets/index-abc.js",
      "assets/index-abc.css",
    ]);
  });

  test("passes a clean build", () => {
    const files = ["index.html", "assets/index-abc123.js", "app-icon.svg"];
    expect(findSeedLeaks(files, () => "console.log('inkling')")).toEqual([]);
  });

  test("ignores a path that merely contains the seed name", () => {
    const files = ["assets/seed-demo-notes.js"];
    expect(findSeedLeaks(files, () => "console.log('inkling')")).toEqual([]);
  });
});
