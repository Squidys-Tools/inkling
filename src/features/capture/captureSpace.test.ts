import { expect, test } from "bun:test";
import { finishSpaceCapture } from "./captureSpace";

function fixture() {
  const calls: string[] = [];
  return {
    calls,
    actions: {
      addRegular: async (s: string, i: string) => {
        calls.push(`add:${s}:${i}`);
      },
      currentSpaceId: (): string | null => null,
      append: () => calls.push("append"),
      reload: () => calls.push("reload"),
    },
  };
}
test("a Smart Space capture re-queries instead of injecting a nonmatching card", async () => {
  const f = fixture();
  await finishSpaceCapture("cat", { id: "coding", kind: "smart" }, f.actions);
  expect(f.calls).toEqual(["reload"]);
});
test("a Regular Space capture persists membership before reloading", async () => {
  const f = fixture();
  await finishSpaceCapture("cat", { id: "pets", kind: "regular" }, f.actions);
  expect(f.calls).toEqual(["add:pets:cat", "reload"]);
});
test("an Everything capture cannot append into a Space selected while saving", async () => {
  const f = fixture();
  f.actions.currentSpaceId = () => "coding";
  await finishSpaceCapture("cat", null, f.actions);
  expect(f.calls).toEqual(["reload"]);
});
test("a capture retains its original Regular destination while selection changes", async () => {
  const f = fixture();
  f.actions.currentSpaceId = () => "new-space";
  await finishSpaceCapture("cat", { id: "original", kind: "regular" }, f.actions);
  expect(f.calls).toEqual(["add:original:cat", "reload"]);
});
test("failed filing truthfully leaves the saved item in Everything", async () => {
  const f = fixture();
  f.actions.addRegular = async () => {
    throw Error("write denied");
  };
  await expect(
    finishSpaceCapture("cat", { id: "pets", kind: "regular" }, f.actions),
  ).rejects.toThrow("Saved in Everything");
  expect(f.calls).toEqual(["reload"]);
});
