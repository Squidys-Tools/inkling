import { expect, test } from "bun:test";
import { createQuitDrain } from "./quit-drain.ts";

test("before-quit holds repeated attempts until cleanup resolves, then permits the final quit", async () => {
  const gate = Promise.withResolvers<void>();
  let drains = 0,
    quits = 0,
    prevented = 0;
  const hook = createQuitDrain(
    () => {
      drains++;
      return gate.promise;
    },
    () => {
      quits++;
    },
    () => {},
  );
  const event = {
    preventDefault: () => {
      prevented++;
    },
  };
  hook(event);
  hook(event);
  await Promise.resolve();
  expect([drains, quits, prevented]).toEqual([1, 0, 2]);
  gate.resolve();
  await new Promise((resolve) => setTimeout(resolve));
  expect(quits).toBe(1);
  hook(event);
  expect(prevented).toBe(2);
});

test("a cleanup failure does not exit and a later quit can retry", async () => {
  let calls = 0,
    errors = 0,
    quits = 0;
  const hook = createQuitDrain(
    async () => {
      if (!calls++) throw Error("cleanup");
    },
    () => {
      quits++;
    },
    () => {
      errors++;
    },
  );
  hook({ preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve));
  expect([errors, quits]).toEqual([1, 0]);
  hook({ preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve));
  expect([calls, quits]).toEqual([2, 1]);
});
