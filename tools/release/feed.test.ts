import { expect, test } from "bun:test";
import { missingFeedFiles } from "./feed.ts";

const feed = (name: string) =>
  `version: 1.0.0\nfiles:\n  - url: ${name}\n    sha512: abc==\n    size: 1\npath: ${name}\nsha512: abc==\n`;

// regression: nightly 20261107.27 shipped a feed naming inkling-Setup-*.exe beside inkling.Setup.*.exe
test("a feed entry whose file is not an asset under that exact name is reported", () => {
  const feeds = { "latest.yml": feed("inkling-Setup-1.0.0.exe") };
  expect(missingFeedFiles(feeds, ["inkling.Setup.1.0.0.exe", "latest.yml"])).toEqual([
    "latest.yml names inkling-Setup-1.0.0.exe",
    "latest.yml names inkling-Setup-1.0.0.exe",
  ]);
  expect(missingFeedFiles(feeds, ["inkling-Setup-1.0.0.exe"])).toEqual([]);
});
