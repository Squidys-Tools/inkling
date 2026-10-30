import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Claude Code reads .claude/skills and Codex reads .agents/skills. Both are real
// copies because a symlink checks out as a plain file on Windows without symlink support.
const files = (root: string) =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
    .sort();

test(".agents/skills stays a byte-for-byte copy of .claude/skills", () => {
  const claude = files(".claude/skills");
  expect(files(".agents/skills")).toEqual(claude);
  for (const path of claude) {
    expect(readFileSync(join(".agents/skills", path))).toEqual(
      readFileSync(join(".claude/skills", path)),
    );
  }
});
