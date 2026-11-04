import { expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { makeWorkerHandlers } from "./handlers.ts";

test("a failed OCR shutdown does not fail the worker's own shutdown", async () => {
  let closed = 0;
  const exit = await Effect.runPromiseExit(
    Effect.scoped(
      makeWorkerHandlers({
        modelCacheDirectory: "unused",
        ocr: {
          recognize: async () => "",
          close: async () => {
            closed += 1;
            throw new Error("OCR worker shutdown timed out");
          },
        },
      }),
    ),
  );
  expect(closed).toBe(1);
  expect(Exit.isSuccess(exit)).toBe(true);
});
