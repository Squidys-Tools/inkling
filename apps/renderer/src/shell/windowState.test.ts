import { expect, test } from "bun:test";
import { observeMaximized } from "./windowState.ts";

function fixture() {
  let changed = (_value: boolean) => {};
  let answer = (_value: boolean) => {};
  let stopped = false;
  const values: boolean[] = [];
  const dispose = observeMaximized(
    {
      isMaximized: () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
      onMaximized: (listener) => {
        changed = listener;
        return () => {
          stopped = true;
        };
      },
    },
    (value) => values.push(value),
  );
  return {
    values,
    answer: (v: boolean) => answer(v),
    change: (v: boolean) => changed(v),
    dispose,
    stopped: () => stopped,
  };
}
test("initial maximized state is queried, not guessed from a click", async () => {
  const f = fixture();
  f.answer(true);
  await Promise.resolve();
  expect(f.values).toEqual([true]);
  f.dispose();
});
test("newer WM maximize/unmaximize events win over a late initial reply", async () => {
  const f = fixture();
  f.change(true);
  f.change(false);
  f.answer(true);
  await Promise.resolve();
  expect(f.values).toEqual([true, false]);
  f.dispose();
});
test("unmount unsubscribes and ignores pending replies/events", async () => {
  const f = fixture();
  f.dispose();
  f.answer(true);
  f.change(true);
  await Promise.resolve();
  expect(f.values).toEqual([]);
  expect(f.stopped()).toBe(true);
});
