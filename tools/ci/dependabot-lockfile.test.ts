import { expect, test } from "bun:test";
import { revertedUpdates, stalePatches } from "./dependabot-lockfile.ts";

const lockfile = (...specs: string[]) =>
  ({
    packages: Object.fromEntries(specs.map((spec) => [spec, [spec, "", {}, "sha512-"]])),
  }) as { packages: Record<string, [string, ...unknown[]]> };

const base = lockfile(
  "@babel/core@7.29.7",
  "debug@4.4.1",
  "minimatch@3.1.5",
  "minimatch@10.2.6",
  "@inkling/ui@workspace:packages/ui",
);

test.each([
  ["keeps a direct update", lockfile("@babel/core@8.0.10"), lockfile("@babel/core@8.0.10"), []],
  [
    "accepts a newer version in range",
    lockfile("@babel/core@8.0.10"),
    lockfile("@babel/core@8.1.0"),
    [],
  ],
  [
    "accepts a prerelease",
    lockfile("gen-mapping@0.4.0-beta.0"),
    lockfile("gen-mapping@0.4.0-beta.0"),
    [],
  ],
  [
    "flags a reverted transitive update",
    lockfile("debug@4.4.3"),
    lockfile("debug@4.4.1"),
    ["debug@4.4.3"],
  ],
  [
    "flags a reverted update hidden by a newer major",
    lockfile("minimatch@3.1.6", "minimatch@10.2.6"),
    lockfile("minimatch@3.1.5", "minimatch@10.2.6"),
    ["minimatch@3.1.6"],
  ],
  ["flags a dropped package", lockfile("entities@9.0.0"), lockfile(), ["entities@9.0.0"]],
  [
    "ignores entries the base already had and non-registry entries",
    lockfile("debug@4.4.1", "@inkling/ui@workspace:packages/ui", "x@github:a/b#c"),
    lockfile(),
    [],
  ],
])("%s", (_name, dependabot, regenerated, reverted) => {
  expect(revertedUpdates(base, dependabot, regenerated)).toEqual(reverted);
});

test.each([
  ["passes a patch for the resolved version", { "sharp@0.35.5": "p.patch" }, []],
  [
    "flags a patch for a version no longer resolved",
    { "sharp@0.35.4": "p.patch" },
    ["p.patch (sharp@0.35.4)"],
  ],
  ["ignores a patch key without a version", { sharp: "p.patch" }, []],
])("%s", (_name, patched, stale) => {
  expect(stalePatches(patched, lockfile("sharp@0.35.5"))).toEqual(stale);
});
