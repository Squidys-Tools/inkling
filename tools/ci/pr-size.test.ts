import { expect, test } from "bun:test";
import type { GitHub } from "./github.ts";
import { sizeLabel, syncSizeLabel } from "./pr-size.ts";

const file = (filename: string, additions: number, deletions = 0) => ({
  filename,
  additions,
  deletions,
});

test.each([
  ["counts added and removed source lines", [file("a.ts", 20, 15)], "size:S"],
  [
    "leaves tests and test helpers out while source changed",
    [
      file("a.ts", 5),
      file("a.test.ts", 400),
      file("x/test-library.ts", 400),
      file("e.spec.tsx", 99),
    ],
    "size:XS",
  ],
  ["sizes a test-only PR by its test lines", [file("a.test.ts", 120)], "size:M"],
  [
    "a file named like a test directory is still source",
    [file("test-data/seed.json", 40)],
    "size:S",
  ],
  ["8750 lines is XXL", [file("a.ts", 8750)], "size:XXL"],
  ["past 8750 lines", [file("a.ts", 8751)], "what the hell"],
])("%s", (_name, files, label) => {
  expect(sizeLabel(files).label).toBe(label);
});

test.each([
  [
    "swaps only the size labels it manages",
    ["size:L", "what the hell", "bug"],
    [
      ["DELETE", "repos/{owner}/{repo}/issues/7/labels/size%3AL", undefined],
      ["DELETE", "repos/{owner}/{repo}/issues/7/labels/what%20the%20hell", undefined],
      ["POST", "repos/{owner}/{repo}/issues/7/labels", { labels: ["size:XS"] }],
    ],
  ],
  ["leaves a PR that already has its label alone", ["size:XS", "bug"], []],
])("%s", async (_name, labels, expected) => {
  const sent: unknown[] = [];
  const api: GitHub = {
    get: async () => {
      throw new Error("unused");
    },
    list: async <T>(path: string) =>
      (path.includes("/files") ? [file("a.ts", 3)] : labels.map((name) => ({ name }))) as T[],
    send: async (method, path, body) => void sent.push([method, path, body]),
  };
  await syncSizeLabel(api, 7);
  expect(sent).toEqual(expected);
});
