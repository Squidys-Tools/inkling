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

  // These pin the Rust semantics in `markdown_to_plain_text`
  // (src-tauri/src/storage.rs), which the same note is projected through
  // whenever the backend is running. A change here is a change there.
  test("keeps words apart across a void inline tag", () => {
    expect(markdownToPlainText("foo<br>bar")).toBe("foo bar");
    expect(markdownToPlainText("one<br/>two")).toBe("one two");
    expect(markdownToPlainText("before<hr>after")).toBe("before after");
  });

  test("keeps a word whole across an inline wrapper and a break hint", () => {
    expect(markdownToPlainText("a<em>bc</em>d")).toBe("abcd");
    expect(markdownToPlainText("hy<wbr>phen")).toBe("hyphen");
    expect(markdownToPlainText("<span>a</span><span>b</span>")).toBe("ab");
  });

  test("drops the task marker without touching brackets written as prose", () => {
    expect(markdownToPlainText("- [x] Measure")).toBe("Measure");
    expect(markdownToPlainText("The prompt prints [X] when the step passes.")).toBe(
      "The prompt prints [X] when the step passes.",
    );
    expect(markdownToPlainText("Toggle between [ ] and [x] in the list.")).toBe(
      "Toggle between [ ] and [x] in the list.",
    );
  });

  test("keeps punctuation tight against the word it follows", () => {
    expect(markdownToPlainText("One line\n\nTwo, and three; done?")).toBe("One line Two, and three; done?");
  });

  // Documented divergence, tracked on the Rust side: it handles `Event::Html`
  // for no case at all, so a block-level tag there joins the words around it.
  test("treats block-level raw HTML as a word boundary", () => {
    expect(markdownToPlainText("before<div>after")).toBe("before after");
    expect(markdownToPlainText("<table><tr><td>cell</td></tr></table>")).toBe("cell");
  });
});

describe("noteBodyForPreview", () => {
  test("does not repeat a leading heading that matches the item title", () => {
    expect(noteBodyForPreview("# Reading list\n\n- [ ] One", "Reading list")).toBe("- [ ] One");
  });

  test("keeps a distinct leading heading", () => {
    expect(noteBodyForPreview("# Notes\n\nBody", "Reading list")).toBe("# Notes\n\nBody");
  });

  test("keeps the leading heading when the item has no title to match it against", () => {
    expect(noteBodyForPreview("# Notes\n\nBody", "")).toBe("# Notes\n\nBody");
    expect(noteBodyForPreview("# Notes\n\nBody", "   ")).toBe("# Notes\n\nBody");
  });

  test("reads a body that is nothing but the title heading as empty", () => {
    expect(noteBodyForPreview("# Reading list", "Reading list")).toBe("");
  });
});

describe("noteBodyForEditor", () => {
  test("removes the duplicated title before editing", () => {
    expect(noteBodyForEditor("# Reading list\n\n- [ ] One", "Reading list")).toBe("- [ ] One");
  });

  test("is empty while the body has not loaded", () => {
    expect(noteBodyForEditor(undefined, "Reading list")).toBe("");
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

  test("does not add a title heading when the item has no title to match it against", () => {
    expect(noteBodyForStorage("# Reading list\n\nOne", "", "Two")).toBe("Two");
  });

  // Clearing the editor used to leave the title heading behind as the whole
  // body: a note that saved, indexed only its title, and reopened empty. It now
  // has no storage body at all, which is what `update_item` refuses too.
  test("has nothing to save when the user emptied a note", () => {
    expect(noteBodyForStorage("# My note\n\nSomething", "My note", "   \n  ")).toBe("");
    expect(noteBodyForStorage("# My note", "My note", "")).toBe("");
    expect(noteBodyForStorage("Plain body", "Reading list", "")).toBe("");
    expect(noteBodyForStorage(undefined, "Reading list", "")).toBe("");
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
