import { expect, test } from "bun:test";
import { createFileImportQueue, type FileImportProgress } from "./fileImport";

const tick = () => new Promise((resolve) => setTimeout(resolve, 2));
async function idle(states: FileImportProgress[]) {
  for (let n = 0; n < 1000; n++) {
    if (states[states.length - 1]?.active === false) return;
    await tick();
  }
  throw new Error("Import did not finish");
}

test("all fifty files save serially, with lazy work and truthful progress", async () => {
  const states: FileImportProgress[] = [],
    saved: number[] = [];
  let active = 0,
    peak = 0;
  const queue = createFileImportQueue<number>(
    (p) => states.push(p),
    () => {},
  );
  queue.enqueue(
    Array.from({ length: 50 }, (_, i) => i),
    async (file) => {
      peak = Math.max(peak, ++active);
      await tick();
      saved.push(file);
      active--;
    },
  );
  await idle(states);
  expect(saved).toEqual(Array.from({ length: 50 }, (_, i) => i));
  expect(peak).toBe(1);
  expect(states[0]).toEqual({ active: true, total: 50, completed: 0, saved: 0, failed: 0 });
  expect(states[states.length - 1]).toEqual({
    active: false,
    total: 50,
    completed: 50,
    saved: 50,
    failed: 0,
  });
  expect(states.every((p) => p.completed === p.saved + p.failed)).toBe(true);
});

test("a failed file does not stop later files, and another selection shares the serial queue", async () => {
  const states: FileImportProgress[] = [],
    saved: number[] = [],
    failed: number[] = [];
  const queue = createFileImportQueue<number>(
    (p) => states.push(p),
    (f) => failed.push(f),
  );
  const save = async (f: number) => {
    await tick();
    if (f === 2) throw new Error("Fixture rejection");
    saved.push(f);
  };
  queue.enqueue([1, 2, 3], save);
  queue.enqueue([4, 5], save);
  await idle(states);
  expect(saved).toEqual([1, 3, 4, 5]);
  expect(failed).toEqual([2]);
  expect(states[states.length - 1]).toEqual({
    active: false,
    total: 5,
    completed: 5,
    saved: 4,
    failed: 1,
  });
  queue.enqueue([6], save);
  await idle(states);
  expect(states[states.length - 1]).toEqual({
    active: false,
    total: 1,
    completed: 1,
    saved: 1,
    failed: 0,
  });
});

test("an empty selection starts no save or progress", () => {
  let calls = 0;
  const queue = createFileImportQueue(
    () => calls++,
    () => calls++,
  );
  queue.enqueue([], async () => {
    calls++;
  });
  expect(calls).toBe(0);
});
