import { expect, test } from "bun:test";
import { patchItems } from "./patchItems";

const a = { id: "a", title: "A" };
const b = { id: "b", title: "B" };
const c = { id: 3, title: "C" };

test("a patched item is replaced in place and every other item keeps its identity", () => {
  const next = patchItems([a, b, c], new Set(["b"]), new Map([["b", { id: "b", title: "B2" }]]));

  expect(next.map((item) => item.title)).toEqual(["A", "B2", "C"]);
  expect(next[0]).toBe(a);
  expect(next[2]).toBe(c);
});

test("a patched item that came back identical keeps its old object and the list identity", () => {
  const current = [a, b];

  expect(patchItems(current, new Set(["b"]), new Map([["b", { ...b }]]))).toBe(current);
});

test("a changed item missing from the result is dropped, as when it was archived", () => {
  const next = patchItems([a, b, c], new Set(["b", "3"]), new Map());

  expect(next).toEqual([a]);
});

test("ids that are not in the list are ignored", () => {
  const current = [a];

  expect(patchItems(current, new Set(["z"]), new Map([["z", { id: "z", title: "Z" }]]))).toBe(
    current,
  );
});
