// Runs before install as vercel.json's ignoreCommand, where only Node exists.
// Exit 0 skips the deploy, anything else builds. An unreachable previous commit
// — orphaned by a force-push — must build, not error the deployment.
import { spawnSync } from "node:child_process";

const git = (args) => spawnSync("git", args, { encoding: "utf8" });
const root = git(["rev-parse", "--show-toplevel"]).stdout.trim();
const prev = process.env.VERCEL_GIT_PREVIOUS_SHA ?? "HEAD^";

const resolvable =
  spawnSync("git", ["cat-file", "-e", `${prev}^{commit}`], { cwd: root }).status === 0;
if (!resolvable) process.exit(1);

const inputs = [
  "apps/site",
  "apps/renderer",
  "packages",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "tsconfig.base.json",
  "patches",
  ".bun-version",
];
const { status } = spawnSync("git", ["diff", "--quiet", prev, "HEAD", "--", ...inputs], {
  cwd: root,
});
process.exit(status === 0 ? 0 : 1);
