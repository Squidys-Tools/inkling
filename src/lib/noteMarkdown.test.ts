import { describe, expect, test } from "bun:test";
import noteLong from "../../benchmarks/corpus/notes/note-long-01.md?raw";
import noteMarkdownFixture from "../../benchmarks/corpus/notes/note-markdown-01.md?raw";
import noteQuick from "../../benchmarks/corpus/notes/note-quick-01.md?raw";
import noteTodo from "../../benchmarks/corpus/notes/note-todo-01.md?raw";
import quoteNoSource from "../../benchmarks/corpus/notes/quote-nosource-01.md?raw";
import quoteSource from "../../benchmarks/corpus/notes/quote-source-01.md?raw";
import { markdownToPlainText } from "./notes";
import { parseNoteMarkdown, serializeNoteDocument } from "./noteMarkdown";

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe("note markdown", () => {
  test("round-trips headings, emphasis, links, and tasks", () => {
    const source = "# Heading\n\n**Bold** and [docs](https://example.com).\n\n- [x] done\n- [ ] next";
    const document = parseNoteMarkdown(source);
    const serialized = serializeNoteDocument(document);

    expect(serialized).toContain("# Heading");
    expect(serialized).toContain("**Bold**");
    expect(serialized).toContain("[docs](https://example.com)");
    expect(serialized).toContain("- [x] done");
    expect(serialized).toContain("- [ ] next");
  });

  test("normalizes empty markdown to an empty source", () => {
    expect(serializeNoteDocument(parseNoteMarkdown("  \n"))).toBe("");
  });
});

describe("corpus notes", () => {
  const fixtures: [name: string, source: string][] = [
    ["note-long-01.md", noteLong],
    ["note-markdown-01.md", noteMarkdownFixture],
    ["note-quick-01.md", noteQuick],
    ["note-todo-01.md", noteTodo],
    ["quote-nosource-01.md", quoteNoSource],
    ["quote-source-01.md", quoteSource],
  ];

  test.each(fixtures)("%s keeps its text and settles after one save", (_name, source) => {
    const once = serializeNoteDocument(parseNoteMarkdown(source));

    // The first pass re-indents a hard-wrapped list continuation; nothing after that moves.
    expect(markdownToPlainText(once)).toBe(markdownToPlainText(source));
    const twice = serializeNoteDocument(parseNoteMarkdown(once));
    expect(serializeNoteDocument(parseNoteMarkdown(twice))).toBe(twice);
  });

  test("note-markdown-01 keeps headings, links, lists, emphasis, and quotes", () => {
    const serialized = serializeNoteDocument(parseNoteMarkdown(noteMarkdownFixture));

    expect(serialized).toContain("# Research Notes: Local-First Search");
    expect(serialized).toContain("## Key ideas");
    expect(serialized).toContain("**FTS5**");
    expect(serialized).toContain("*offline search*");
    expect(serialized).toContain("[SQLite FTS5 docs](https://sqlite.org/fts5.html)");
    expect(serialized).toContain("`docs/tech-stack.md`");
    expect(serialized).toContain("1. Do we index `metadata` JSON as a blob");
    expect(serialized).toContain("> Search is the new shelf.");
  });

  test("note-todo-01 keeps every task and its checked state", () => {
    const serialized = serializeNoteDocument(parseNoteMarkdown(noteTodo));

    expect(countOccurrences(serialized, "- [x] ")).toBe(2);
    expect(countOccurrences(serialized, "- [ ] ")).toBe(6);
    expect(serialized).toContain("## Notes");
  });
});
