import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const selectSitePreviewBase = ({ before, base, head, isAncestor }) =>
  before && isAncestor(before, head) ? before : base;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [before, base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("usage: site-preview-base.mjs <before> <base> <head>");
    process.exit(64);
  }

  const selected = selectSitePreviewBase({
    before,
    base,
    head,
    isAncestor: (ancestor, descendant) =>
      spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
        stdio: "ignore",
      }).status === 0,
  });
  console.log(selected);
}
