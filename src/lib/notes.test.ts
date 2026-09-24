import { describe, expect, test } from "bun:test";
import { markdownToPlainText, normalizeNoteBody, noteBodyForPreview } from "./notes";

describe("markdownToPlainText", () => {
  test("removes common note formatting while keeping readable text", () => {
    expect(markdownToPlainText("# Heading\n\n**Bold** and [a link](https://example.com).")).toBe(
      "Heading Bold and a link.",
    );
  });

  test("removes task markers and list syntax", () => {
    expect(markdownToPlainText("- [x] Ship the editor\n- [ ] Verify the preview")).toBe(
      "Ship the editor Verify the preview",
    );
  });

  test("keeps code content and removes raw HTML", () => {
    expect(markdownToPlainText("`<tag>`\n\n<script>alert(1)</script>")).toBe(
      "<tag> alert(1)",
    );
  });
});

describe("noteBodyForPreview", () => {
  test("does not repeat a leading heading that matches the item title", () => {
    expect(noteBodyForPreview("# Reading list\n\n- [ ] One", "Reading list")).toBe("- [ ] One");
  });

  test("keeps a distinct leading heading", () => {
    expect(noteBodyForPreview("# Notes\n\nBody", "Reading list")).toBe("# Notes\n\nBody");
  });
});

describe("normalizeNoteBody", () => {
  test("normalizes line endings and trims the source", () => {
    expect(normalizeNoteBody("\r\n  # Note\r\nbody  \r\n")).toBe("# Note\nbody");
  });
});
