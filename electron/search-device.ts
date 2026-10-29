import type { InferenceSession } from "onnxruntime-node";

export type SearchDevice = "cuda" | "dml" | "webgpu" | "cpu";

export function searchDevices(platform: string, available: readonly string[]): SearchDevice[] {
  const supported = new Set(available);
  const preferred: SearchDevice[] =
    platform === "linux"
      ? ["cuda", "webgpu"]
      : platform === "win32"
        ? ["cuda", "dml", "webgpu"]
        : ["webgpu"];
  return [...preferred.filter((device) => supported.has(device)), "cpu"];
}

export function searchSessionOptions(device: SearchDevice): InferenceSession.SessionOptions {
  return {
    intraOpNumThreads: 2,
    interOpNumThreads: 1,
    executionMode: "sequential",
    enableMemPattern: device !== "dml",
    executionProviders: [device],
  };
}

// Once a GPU fails, the same request must finish on CPU rather than retrying that GPU indefinitely.
export async function withCpuFallback<T>(
  device: SearchDevice,
  run: (device: SearchDevice) => Promise<T>,
  failed: (device: SearchDevice) => Promise<void>,
) {
  try {
    return await run(device);
  } catch (error) {
    if (device === "cpu") throw error;
    await failed(device);
    return run("cpu");
  }
}
