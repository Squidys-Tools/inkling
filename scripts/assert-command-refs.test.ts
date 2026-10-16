import { describe, expect, test } from "bun:test";
import { findBrokenCommandRefs } from "./assert-command-refs";

// The guard is what stops a renamed script from leaving stale commands in the
// docs, so it is worth proving it still fires. Detection is covered with inputs
// rather than the real repository; the wiring is covered by `bun run check:refs`.

const scripts = new Set(["check", "typecheck", "dev:app"]);

describe("findBrokenCommandRefs", () => {
  test("flags a documented command that package.json no longer defines", () => {
    const text = "Run `bun run lint` before pushing.";
    expect(findBrokenCommandRefs([{ file: "AGENTS.md", text }], scripts)).toEqual([
      { file: "AGENTS.md", line: 1, script: "lint" },
    ]);
  });

  test("reports the line of each broken reference", () => {
    const text = "intro\n`bun run check`\n`bun run gone`";
    expect(findBrokenCommandRefs([{ file: "docs/a.md", text }], scripts)).toEqual([
      { file: "docs/a.md", line: 3, script: "gone" },
    ]);
  });

  test("passes existing scripts and reads only the name, not trailing punctuation", () => {
    const text = "Run `bun run check`. Then bun run typecheck, or bun run dev:app.";
    expect(findBrokenCommandRefs([{ file: "README.md", text }], scripts)).toEqual([]);
  });

  test("does not read a workspace command's script against the root package.json", () => {
    const text = "bun run --cwd extension build";
    expect(findBrokenCommandRefs([{ file: "docs/a.md", text }], scripts)).toEqual([]);
  });

  test("skips the changelog, whose entries record past commands", () => {
    const text = "- `bun run preview:win` no longer fails.";
    expect(findBrokenCommandRefs([{ file: "docs/changelog.md", text }], scripts)).toEqual([]);
  });
});
