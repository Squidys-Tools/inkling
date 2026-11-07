import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { startTextInference } from "./text-inference.ts";

test("a lane closes only once idle, never with a window waiting, and frees its thread", async () => {
  const directory = mkdtempSync(join(tmpdir(), "inkling-text-inference-"));
  try {
    // Replies well past the idle time: closing with a window waiting would reject it.
    const script = join(directory, "thread.mjs");
    writeFileSync(
      script,
      `import { parentPort } from "node:worker_threads";
       parentPort.on("message", ({ id }) =>
         setTimeout(() => parentPort.postMessage({ id, dims: [1] }), 300));`,
    );
    const thread = new Worker(script);
    const exited = new Promise((resolve) => thread.once("exit", resolve));
    const { promise: stopped, resolve } = Promise.withResolvers<void>();
    const infer = startTextInference("unused", resolve, { idleMillis: 50, thread });
    const window = { ids: [1], typeIds: [0], mask: [1] };
    // A long document sends its next window as the previous reply lands; it must not be closed.
    await infer(window);
    await infer(window);
    await stopped;
    await exited;
    await expect(infer(window)).rejects.toThrow("idle");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);

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
