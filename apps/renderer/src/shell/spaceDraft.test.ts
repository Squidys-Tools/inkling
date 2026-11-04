import { afterEach, expect, test } from "bun:test";
import {
  closeSpaceDraft,
  createDraftedSpace,
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

test("a second Enter while the Space saves does not create it twice", async () => {
  const saves: Array<() => void> = [];
  const create = (name: string) =>
    new Promise<string | null>((resolve) => saves.push(() => resolve(name)));
  openSpaceDraft();
  updateSpaceDraft({ name: "Double" });
  const first = createDraftedSpace(create);
  const second = createDraftedSpace(create);
  for (const save of saves) save();
  expect(await first).toBe("Double");
  expect(await second).toBeNull();
  expect(saves).toHaveLength(1);
  expect(spaceDraft.get().open).toBe(false);

  openSpaceDraft();
  updateSpaceDraft({ name: "Next" });
  const third = createDraftedSpace(create);
  saves[1]();
  expect(await third).toBe("Next");
});
