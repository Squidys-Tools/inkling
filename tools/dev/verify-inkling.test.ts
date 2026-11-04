import { expect, test } from "bun:test";
import { runHasLiveProcess } from "../../.claude/skills/verify-inkling/scripts/clean-dev.ts";

test("a live launcher keeps a run active before Electron's pid is recorded", () => {
  expect(runHasLiveProcess({ launcherPid: 41 }, new Set([41]))).toBe(true);
});

test("a live Electron process keeps a run active", () => {
  expect(runHasLiveProcess({ electronPid: 42 }, new Set([42]))).toBe(true);
});

test("a stale run does not count as active", () => {
  expect(runHasLiveProcess({ launcherPid: 41, electronPid: 42 }, new Set([99]))).toBe(false);
});
