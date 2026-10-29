import { expect, test } from "bun:test";
import { searchDevices, searchSessionOptions, withCpuFallback } from "./search-device.ts";

test("runtime-supported GPU order never removes the CPU fallback", () => {
  expect(searchDevices("linux", ["cpu", "cuda", "webgpu"])).toEqual(["cuda", "webgpu", "cpu"]);
  expect(searchDevices("win32", ["cpu", "dml", "webgpu"])).toEqual(["dml", "webgpu", "cpu"]);
  expect(searchDevices("win32", ["cuda", "dml"])).toEqual(["cuda", "dml", "cpu"]);
  expect(searchDevices("linux", ["cpu"])).toEqual(["cpu"]);
  expect(searchSessionOptions("dml").enableMemPattern).toBe(false);
  expect(searchSessionOptions("dml").executionMode).toBe("sequential");
});

test("a missing driver or GPU allocation failure retries the exact work on CPU once", async () => {
  const calls: string[] = [];
  const result = await withCpuFallback(
    "cuda",
    async (device) => {
      calls.push(device);
      if (device !== "cpu") throw new Error("GPU allocation failed");
      return new Float32Array([1, 2]);
    },
    async (device) => {
      calls.push(`retired:${device}`);
    },
  );
  expect(calls).toEqual(["cuda", "retired:cuda", "cpu"]);
  expect(Array.from(result)).toEqual([1, 2]);
  await expect(
    withCpuFallback(
      "cpu",
      async () => {
        throw new Error("bad model");
      },
      async () => {
        throw new Error("unexpected retry");
      },
    ),
  ).rejects.toThrow("bad model");
});
