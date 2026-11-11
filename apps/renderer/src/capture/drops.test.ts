import { expect, test } from "bun:test";
import { watchDrops } from "./drops.ts";

function transfer(data: Record<string, string>) {
  const held = new Map(Object.entries(data));
  return {
    get types() {
      return [...held.keys()];
    },
    files: [],
    dropEffect: "none",
    getData: (type: string) => held.get(type) ?? "",
    setData: (type: string, value: string) => void held.set(type, value),
  };
}

test("a link dragged from inside the window is not saved when it lands on the library", () => {
  const target = new EventTarget();
  const saved: string[] = [];
  const hints: boolean[] = [];
  const stop = watchDrops(target, true, (dragging) => hints.push(dragging), {
    files: () => saved.push("files"),
    text: (text) => saved.push(text),
  });
  const send = (type: string, dataTransfer: ReturnType<typeof transfer>) =>
    target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { dataTransfer }));

  const own = transfer({ "text/uri-list": "app://local/index.html#/" });
  for (const type of ["dragstart", "dragenter", "dragover", "drop"]) send(type, own);
  expect(saved).toEqual([]);
  expect(hints).not.toContain(true);
  expect(own.dropEffect).toBe("none");

  const outside = transfer({ "text/uri-list": "# a comment\nhttps://example.com/a\n" });
  for (const type of ["dragenter", "dragover", "drop"]) send(type, outside);
  expect(saved).toEqual(["https://example.com/a"]);
  expect(hints).toEqual([false, true, false]);
  expect(outside.dropEffect).toBe("copy");

  stop();
  send("drop", transfer({ "text/plain": "https://example.com/b" }));
  expect(saved).toHaveLength(1);
});
