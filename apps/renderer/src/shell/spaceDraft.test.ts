import { afterEach, expect, test } from "bun:test";
import {
  closeSpaceDraft,
  openSpaceDraft,
  resumeSpaceDraft,
  spaceDraft,
  updateSpaceDraft,
} from "./spaceDraft.ts";

afterEach(closeSpaceDraft);

test("compact plus resumes the exact draft, including its kind and captured search", () => {
  openSpaceDraft("cats and dogs");
  updateSpaceDraft({ name: "Weekend pets", kind: "regular" });
  const previous = spaceDraft.get();
  resumeSpaceDraft();
  expect(spaceDraft.get()).toBe(previous);
  expect(spaceDraft.get()).toEqual({
    open: true,
    name: "Weekend pets",
    kind: "regular",
    query: "cats and dogs",
  });
});

test("compact plus creates a new draft only when there is none", () => {
  closeSpaceDraft();
  resumeSpaceDraft();
  expect(spaceDraft.get()).toEqual({ open: true, name: "", kind: "smart", query: "" });
});
