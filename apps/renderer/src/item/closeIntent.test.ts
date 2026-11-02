import { expect, test } from "bun:test";
import { createCloseIntent } from "./closeIntent.ts";

test("repeated Close/Escape cannot issue two relative history traversals in one flight", () => {
  const admit = createCloseIntent();
  let index = 2;
  const close = () => {
    if (admit("item-entry")) index -= 1;
  };
  close();
  close();
  expect(index).toBe(1);
});

test("a different history entry can close after a Similar navigation", () => {
  const admit = createCloseIntent();
  expect(admit("first")).toBe(true);
  expect(admit("first")).toBe(false);
  expect(admit("similar")).toBe(true);
  expect(admit("similar")).toBe(false);
});
