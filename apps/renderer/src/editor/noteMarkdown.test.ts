import { describe, expect, test } from "bun:test";
import { MarkdownManager } from "@tiptap/markdown";
import { type NoteClasses, noteExtensions } from "./noteMarkdown.ts";
import { normalizeNoteBody, noteBodyForEditor, noteBodyForStorage } from "./notes.ts";

const manager = new MarkdownManager({ extensions: noteExtensions() });
const roundTrip = (markdown: string) =>
  normalizeNoteBody(manager.serialize(manager.parse(normalizeNoteBody(markdown))));

const research = `# Research Notes: Local-First Search

Notes for the *offline search* design meeting, collected from last week's
reading.

## Key ideas

- **FTS5** is the built-in full-text engine. It handles tokenization,
  ranking, and phrase queries without a server.
- **Background processing** should never block capture.

## Questions to settle

1. Do we index \`metadata\` JSON as a blob, or extract fields into separate
   FTS columns?
2. What is the fallback when FTS5 is unavailable?

## Links

- [SQLite FTS5 docs](https://sqlite.org/fts5.html)

> Search is the new shelf.

\`\`\`
const shelf = "search";
\`\`\``;

const todo = `# Reading room

- [x] Measure the wall for the new shelves
- [x] Order the reading chairs (2x, walnut)
- [ ] Fix the drawer that won't close
  - [ ] Find the right screws

## Notes

- [ ] Confirm chair delivery time`;

describe("note markdown", () => {
  test("an empty note stays empty", () => {
    expect(roundTrip("  \n")).toBe("");
  });

  test.each([
    ["research", research],
    ["todo", todo],
  ])("%s settles after the second save", (_name, source) => {
    // Each of the first two saves re-indents a hard-wrapped list continuation; nothing moves after that.
    const twice = roundTrip(roundTrip(source));
    expect(roundTrip(twice)).toBe(twice);
  });

  test("keeps headings, emphasis, links, lists, code and quotes", () => {
    const saved = roundTrip(research);
    for (const fragment of [
      "# Research Notes: Local-First Search",
      "## Key ideas",
      "**FTS5**",
      "*offline search*",
      "[SQLite FTS5 docs](https://sqlite.org/fts5.html)",
      "1. Do we index `metadata` JSON as a blob",
      "> Search is the new shelf.",
      'const shelf = "search";',
    ])
      expect(saved).toContain(fragment);
  });

  test("keeps every task, its checked state and its nesting", () => {
    const saved = roundTrip(todo);
    expect(saved.split("- [x] ").length - 1).toBe(2);
    expect(saved.split("- [ ] ").length - 1).toBe(3);
    expect(saved).toMatch(/\n\s+- \[ \] Find the right screws/u);
  });

  test("styling classes do not change what is saved", () => {
    const classes: NoteClasses = {
      paragraph: "p",
      heading: "h",
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
      taskList: "tl",
      taskItem: "ti",
      taskItemDone: "done",
      blockquote: "q",
      codeBlock: "pre",
      code: "code",
      link: "a",
      horizontalRule: "hr",
    };
    const styled = new MarkdownManager({ extensions: noteExtensions(classes) });
    expect(normalizeNoteBody(styled.serialize(styled.parse(todo)))).toBe(roundTrip(todo));
  });
});

describe("note title heading", () => {
  test("the editor gets the body without the heading that repeats the title", () => {
    expect(noteBodyForEditor("# Groceries\n\nMilk", "Groceries")).toBe("Milk");
    expect(noteBodyForEditor("# Other\n\nMilk", "Groceries")).toBe("# Other\n\nMilk");
  });

  test("saving puts the title heading back only when the stored body had it", () => {
    expect(noteBodyForStorage("# Groceries\n\nMilk", "Groceries", "Milk\nEggs")).toBe(
      "# Groceries\n\nMilk\nEggs",
    );
    expect(noteBodyForStorage("Milk", "Groceries", "Eggs")).toBe("Eggs");
  });

  test("an emptied note saves as empty, not as its title alone", () => {
    expect(noteBodyForStorage("# Groceries\n\nMilk", "Groceries", "  \n")).toBe("");
  });
});
