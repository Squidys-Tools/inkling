// Idempotent installer for this repo's git hooks (lefthook + Entire).
//
// Why this exists: Entire wraps lefthook's hooks -- `.git/hooks/pre-push` is
// Entire's wrapper, which chains to `pre-push.pre-entire` (the lefthook shim).
// A bare `lefthook install` replaces Entire's wrapper, so after installing
// lefthook hooks the Entire wrapper must be restored. This script performs
// that repair, but only when something is actually missing, so a routine
// `bun install` stays a no-op instead of churning hook files on every run.
//
// Run automatically via the `prepare` lifecycle script (`bun install`), which
// also covers fresh clones. Linked git worktrees share the main checkout's
// hooks directory, so they need no setup -- and a repair must never run from
// a worktree, because lefthook bakes absolute repo paths into its shims.
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function gitOut(args: string[]): string | null {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  const p = r.stdout.trim();
  return p || null;
}

function hooksDir(): string | null {
  // --git-path honors core.hooksPath and resolves each linked worktree to the shared hooks dir.
  const p = gitOut(["rev-parse", "--git-path", "hooks"]);
  if (p === null) return null;
  return path.isAbsolute(p) ? p : path.resolve(p);
}

function contains(file: string, marker: string): boolean {
  try {
    return readFileSync(file, "utf8").includes(marker);
  } catch {
    return false;
  }
}

function have(cmd: string): boolean {
  try {
    return !spawnSync(cmd, ["--version"], { stdio: "ignore" }).error;
  } catch {
    return false;
  }
}

function run(cmd: string, args: string[]): number {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  return r.error || r.status !== 0 ? 1 : 0;
}

function entireEnabled(): boolean {
  try {
    const settings = JSON.parse(readFileSync(".entire/settings.json", "utf8"));
    if (settings && settings.enabled === false) return false;
  } catch {
    return false;
  }
  return have("entire");
}

// Lefthook stashes replaced hooks as *.old, which breaks its next bare
// install ("can't rename ... file already exists"). Remove the copies our two
// managers churn; never touch anything else.
function removeManagedBackup(file: string): void {
  try {
    if (!existsSync(file)) return;
    const c = readFileSync(file, "utf8");
    if (c.includes("Entire CLI hooks") || c.includes("call_lefthook")) unlinkSync(file);
  } catch {
    /* best effort */
  }
}

const dir = hooksDir();
if (dir === null) {
  console.log("setup-hooks: not inside a git worktree, skipping hook install.");
  process.exit(0);
}
mkdirSync(dir, { recursive: true });

const gitDir = gitOut(["rev-parse", "--absolute-git-dir"]);
const commonDir = gitOut(["rev-parse", "--git-common-dir"]);
const inLinkedWorktree =
  gitDir !== null &&
  commonDir !== null &&
  path.resolve(gitDir).toLowerCase() !== path.resolve(commonDir).toLowerCase();

const prePush = path.join(dir, "pre-push");
const entireWrapped = contains(prePush, "Entire CLI hooks");
const lefthookShim =
  contains(prePush, "call_lefthook") ||
  contains(path.join(dir, "pre-push.pre-entire"), "call_lefthook");

if (entireEnabled()) {
  removeManagedBackup(path.join(dir, "pre-push.old"));
  removeManagedBackup(path.join(dir, "pre-commit.old"));
  if (!entireWrapped || !lefthookShim) {
    if (inLinkedWorktree) {
      console.error(
        "setup-hooks: git hooks are shared from the main checkout but look damaged; " +
          "run `bun install` in the main checkout to repair them, then retry here."
      );
      process.exit(1);
    }
    console.log("setup-hooks: installing lefthook hooks, then restoring Entire wrappers…");
    if (run("lefthook", ["install", "-f"]) !== 0) process.exit(1);
    if (run("entire", ["doctor", "--force"]) !== 0) {
      console.warn(
        "setup-hooks: WARNING: `entire doctor --force` failed; lefthook hooks are " +
          "installed but Entire session sync is not. Re-run `entire doctor --force` manually."
      );
    }
    removeManagedBackup(path.join(dir, "pre-push.old"));
    removeManagedBackup(path.join(dir, "pre-commit.old"));
  }
} else if (!lefthookShim) {
  console.log("setup-hooks: installing lefthook hooks…");
  if (run("lefthook", ["install"]) !== 0) process.exit(1);
}
