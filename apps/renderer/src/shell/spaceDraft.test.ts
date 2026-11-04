import { afterEach, expect, mock, test } from "bun:test";
import type { Space } from "@inkling/contracts";

const saves: Array<(space: Space) => void> = [];
const createSpace = mock(() => new Promise<Space>((resolve) => saves.push(resolve)));
mock.module("../library/spaces.ts", () => ({ createSpace }));
const {
  closeSpaceDraft,
  createDraftedSpace,
  openSpaceDraft,
  resumeSpaceDraft,
  spaceDraft,
  updateSpaceDraft,
} = await import("./spaceDraft.ts");

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

test("a second Enter while the Space saves does not create it twice", async () => {
  openSpaceDraft();
  updateSpaceDraft({ name: "Double" });
  const first = createDraftedSpace();
  const second = createDraftedSpace();
  const space = { id: "space-1", name: "Double" } as Space;
  for (const save of saves) save(space);
  expect(await first).toBe(space);
  expect(await second).toBeNull();
  expect(createSpace).toHaveBeenCalledTimes(1);
  expect(spaceDraft.get().open).toBe(false);
});
