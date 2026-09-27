import { describe, expect, test } from "bun:test";
import {
  isSafeNoteLink,
  markdownToPlainText,
  normalizeNoteBody,
  noteBodyForEditor,
  noteBodyForPreview,
  noteBodyForStorage,
} from "./notes";

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

describe("noteBodyForEditor", () => {
  test("removes the duplicated title before editing", () => {
    expect(noteBodyForEditor("# Reading list\n\n- [ ] One", "Reading list")).toBe("- [ ] One");
  });
});

describe("noteBodyForStorage", () => {
  test("restores the original title heading after editing", () => {
    expect(noteBodyForStorage("# Reading list\n\n- [ ] One", "Reading list", "- [ ] Two")).toBe(
      "# Reading list\n\n- [ ] Two",
    );
  });

  test("does not add a title heading when the source did not have one", () => {
    expect(noteBodyForStorage("Plain body", "Reading list", "Updated body")).toBe("Updated body");
  });
});

describe("normalizeNoteBody", () => {
  test("normalizes line endings and trims the source", () => {
    expect(normalizeNoteBody("\r\n  # Note\r\nbody  \r\n")).toBe("# Note\nbody");
  });
});

describe("isSafeNoteLink", () => {
  test("accepts web URLs", () => {
    expect(isSafeNoteLink("https://example.com/dillard")).toBe(true);
    expect(isSafeNoteLink("http://example.com")).toBe(true);
  });

  test("refuses schemes that would run or embed on open", () => {
    expect(isSafeNoteLink("javascript:alert(1)")).toBe(false);
    expect(isSafeNoteLink("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeNoteLink("file:///C:/Windows/System32/config/SAM")).toBe(false);
    expect(isSafeNoteLink("vbscript:msgbox(1)")).toBe(false);
  });

  test("refuses anything that is not a URL", () => {
    expect(isSafeNoteLink("")).toBe(false);
    expect(isSafeNoteLink("   ")).toBe(false);
    expect(isSafeNoteLink("example.com")).toBe(false);
  });
});
