import { describe, expect, test } from "bun:test";
import { noteBodyForEditor, noteBodyForStorage } from "./notes";

describe("noteBodyForEditor", () => {
  test("does not repeat a leading heading that matches the item title", () => {
    expect(noteBodyForEditor("# Reading list\n\n- [ ] One", "Reading list")).toBe("- [ ] One");
  });

  test("keeps a distinct leading heading", () => {
    expect(noteBodyForEditor("# Notes\n\nBody", "Reading list")).toBe("# Notes\n\nBody");
  });

  test("keeps the leading heading when the item has no title to match it against", () => {
    expect(noteBodyForEditor("# Notes\n\nBody", "")).toBe("# Notes\n\nBody");
    expect(noteBodyForEditor("# Notes\n\nBody", "   ")).toBe("# Notes\n\nBody");
  });

  test("reads a body that is nothing but the title heading as empty", () => {
    expect(noteBodyForEditor("# Reading list", "Reading list")).toBe("");
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

  test("has nothing to save when the user emptied a note", () => {
    expect(noteBodyForStorage("# My note\n\nSomething", "My note", "   \n  ")).toBe("");
    expect(noteBodyForStorage("# My note", "My note", "")).toBe("");
    expect(noteBodyForStorage("Plain body", "Reading list", "")).toBe("");
    expect(noteBodyForStorage(undefined, "Reading list", "")).toBe("");
  });
});
