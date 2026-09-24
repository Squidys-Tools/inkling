import { describe, expect, test } from "bun:test";
import { parseNoteMarkdown, serializeNoteDocument } from "./noteMarkdown";

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
