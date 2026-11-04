import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startTextInference } from "./text-inference.ts";

test("a thread that cannot start fails the window waiting on it and reports that it stopped", async () => {
  const directory = mkdtempSync(join(tmpdir(), "inkling-text-inference-"));
  try {
    const { promise: stopped, resolve } = Promise.withResolvers<void>();
    const infer = startTextInference(join(directory, "missing.onnx"), resolve);
    const window = { ids: [1], typeIds: [0], mask: [1] };
    await expect(infer(window)).rejects.toThrow();
    await stopped;
    await expect(infer(window)).rejects.toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
