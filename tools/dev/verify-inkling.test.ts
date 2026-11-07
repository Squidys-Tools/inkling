import { sep } from "node:path";
import { expect, test } from "bun:test";
import {
  devDir,
  mentionsDev,
  runHasLiveProcess,
} from "../../.claude/skills/verify-inkling/scripts/clean-dev.ts";
import { worktreeApp } from "../repo/clean-worktree.ts";

const electron = (command: string) => ({ pid: 1, name: "electron.exe", command });

test("a dev:app library next to .dev is not verification scratch", () => {
  expect(mentionsDev(electron(`electron . --user-data-dir=${devDir}-library`))).toBe(false);
  expect(mentionsDev(electron(`electron . --user-data-dir=${devDir}${sep}verify-inkling`))).toBe(
    true,
  );
});

test("only an Electron process stops the settle of a worktree whose path names electron", () => {
  const worktree = `${sep}w${sep}inkling-electron-bump`;
  const named = (command: string) => ({ pid: 1, name: "", command });
  const editor = named(`node ${worktree}${sep}node_modules${sep}typescript${sep}tsserver.js`);
  const app = named(`${worktree}${sep}node_modules${sep}electron${sep}dist${sep}electron .`);
  expect(worktreeApp([editor], worktree)).toBeUndefined();
  expect(worktreeApp([editor, app], worktree)).toBe(app);
});

test("a live launcher keeps a run active before Electron's pid is recorded", () => {
  expect(runHasLiveProcess({ launcherPid: 41 }, new Set([41]))).toBe(true);
});

test("a live Electron process keeps a run active", () => {
  expect(runHasLiveProcess({ electronPid: 42 }, new Set([42]))).toBe(true);
});

test("a stale run does not count as active", () => {
  expect(runHasLiveProcess({ launcherPid: 41, electronPid: 42 }, new Set([99]))).toBe(false);
});
