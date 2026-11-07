// T3 runs this when a thread settles ("Clean up worktree" in t3.json). It removes what
// this worktree generated: the verification run, the dev:app scratch library, build output
// and installed packages. Source, git state and `.artifacts/` evidence are left alone.

import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  assertWorktree,
  cleanDev,
  fold,
  listProcesses,
  root,
  stopOwned,
} from "../../.claude/skills/verify-inkling/scripts/clean-dev.ts";

// Bun lays node_modules out per package, so the root, the extension and each workspace package can hold one.
const packageDirs = [
  "",
  "extension",
  ...["apps", "packages", "tools"].flatMap((parent) =>
    existsSync(join(root, parent))
      ? readdirSync(join(root, parent)).map((name) => join(parent, name))
      : [],
  ),
];

const targets = [
  join(root, ".dev-library"),
  join(root, "dist"),
  ...packageDirs.map((dir) => join(root, dir, "node_modules")),
];

// Deleting files under a running Electron app breaks it. Such an app's command line names this worktree.
const runningApp = () => {
  const base = `${fold(root)}${sep}`;
  return listProcesses().find(
    (p) =>
      p.pid !== process.pid &&
      /electron/i.test(p.name || p.command) &&
      fold(p.command).includes(base),
  );
};

try {
  assertWorktree();
  // A linked worktree's .git is a file. In the main checkout, .dev-library is the developer's own data.
  if (!lstatSync(join(root, ".git")).isFile())
    throw new Error(
      "refusing: this is the main checkout, not a worktree; settle runs only in a worktree",
    );
  // Check before anything is deleted: cleanDev() removes .dev, and a refusal must leave every target in place.
  await stopOwned();
  const app = runningApp();
  if (app)
    throw new Error(
      `refusing: an Electron app from this worktree is still running (pid ${app.pid}); close it, then rerun`,
    );
  const verification = await cleanDev();
  const removed: string[] = [];
  for (const target of targets) {
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
    removed.push(relative(root, target));
  }
  console.log(
    `clean-worktree: ${verification.note}; removed ${removed.join(", ") || "nothing else"}`,
  );
} catch (error) {
  console.error(`clean-worktree: ${(error as Error).message}`);
  process.exit(1);
}
