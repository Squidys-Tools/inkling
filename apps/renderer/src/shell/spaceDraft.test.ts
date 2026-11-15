import { afterEach, expect, test } from "bun:test";
import {
  closeSpaceDraft,
  createDraftedSpace,
  openSpaceDraft,
  spaceDraft,
  updateSpaceDraft,
} from "./spaceDraft.ts";

afterEach(closeSpaceDraft);

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
