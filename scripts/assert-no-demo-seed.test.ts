import { describe, expect, test } from "bun:test";
import { findSeedLeaks } from "./assert-no-demo-seed";

// The guard is what stops a later refactor from quietly shipping the seed
// again, so it is worth proving it still fires. Detection is covered with
// inputs rather than a real build; the wiring is covered by `bun run build:app`.

const noDirs = () => false;
const readNothing = () => "";

function leaked(read: (path: string) => string) {
  return (path: string) => (path === "seed-demo" ? true : read(path));
}

describe("findSeedLeaks", () => {
  test("flags copied seed assets", () => {
    const findings = findSeedLeaks([], leaked(readNothing), readNothing);
    expect(findings).toEqual([
      { path: "seed-demo", reason: "seed assets were copied into the build" },
    ]);
  });

  test("flags bundled code that still references the seed path", () => {
    const files = ["assets/index-abc123.js"];
    const read = (path: string) =>
      path === files[0] ? 'const s="/seed-demo/photo.jpg";' : "";
    const findings = findSeedLeaks(files, noDirs, read);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe(files[0]);
  });

  test("flags a seed reference hiding in CSS too", () => {
    const files = ["assets/index-abc123.css"];
    const read = (path: string) =>
      path === files[0] ? 'body{background:url("/seed-demo/a.jpg")}' : "";
    expect(findSeedLeaks(files, noDirs, read)).toHaveLength(1);
  });

  test("reports every leak rather than stopping at the first", () => {
    const files = ["assets/a.js", "assets/b.js"];
    const read = (path: string) =>
      files.includes(path) ? '"/seed-demo/x.jpg"' : "";
    expect(findSeedLeaks(files, leaked(read), read)).toHaveLength(3);
  });

  test("passes a clean build", () => {
    const files = ["index.html", "assets/index-abc123.js", "tauri.svg"];
    const read = () => "console.log('inkling')";
    expect(findSeedLeaks(files, noDirs, read)).toEqual([]);
  });

  test("ignores a path that merely contains the seed name", () => {
    // Guards against the check being loose enough to reject legitimate output.
    const files = ["assets/seed-demo-notes.js"];
    const read = () => "console.log('inkling')";
    expect(findSeedLeaks(files, noDirs, read)).toEqual([]);
  });
});
