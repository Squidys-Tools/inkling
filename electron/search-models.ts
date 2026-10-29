import { createReadStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, extname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { listSupportedBackends } from "onnxruntime-node";
import { ensureAsset } from "./embeddings.ts";
import manifest from "./search-model-manifest.json" with { type: "json" };
import type { SearchModelRequest } from "./search-runtime.ts";
import { searchDevices, withCpuFallback, type SearchDevice } from "./search-device.ts";

type Pending = {
  directory: string;
  request: SearchModelRequest;
  resolve: (result: Float32Array | string) => void;
  reject: (error: Error) => void;
};
const workerUrl = new URL(
  `./search-worker${extname(fileURLToPath(import.meta.url))}`,
  import.meta.url,
);
const require = createRequire(import.meta.url);
const ortRoot = dirname(require.resolve("onnxruntime-node/package.json"));
const cudaProvider = join(
  ortRoot,
  "bin",
  "napi-v6",
  process.platform,
  process.arch,
  process.platform === "win32"
    ? "onnxruntime_providers_cuda.dll"
    : "libonnxruntime_providers_cuda.so",
);
async function matches(path: string, expected: string) {
  try {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex") === expected;
  } catch {
    return false;
  }
}

export type SearchModels = {
  embedQuery: (text: string) => Promise<Float32Array>;
  embedText: (text: string, title?: string) => Promise<Float32Array>;
  embedImage: (bytes: Uint8Array) => Promise<Float32Array>;
  caption: (bytes: Uint8Array) => Promise<string>;
  close: () => Promise<void>;
};

export function createSearchModels(
  cache: string,
  bundled?: string,
  options: {
    device?: SearchDevice;
    acceleratorDirectory?: string;
    onDevice?: (device: SearchDevice, fallback: boolean) => void;
    queryOnly?: boolean;
  } = {},
): SearchModels {
  const roots = new Map<string, Promise<string>>();
  const queue: Pending[] = [];
  const queries = new Map<string, Promise<Float32Array>>();
  const cpuOnly = new Set<string>();
  // A text-only CPU process keeps typed queries independent of non-preemptible
  // image/caption GPU work, without a second vision model or extra VRAM.
  let queryModels: SearchModels | undefined;
  const available = listSupportedBackends()
    .filter((entry) => entry.bundled || (entry.name === "cuda" && existsSync(cudaProvider)))
    .map((entry) => entry.name);
  const preferred = options.device ?? searchDevices(process.platform, available)[0];
  const accelerators =
    options.acceleratorDirectory ??
    (bundled ? join(bundled, "..", "accelerators", "cuda") : join(cache, "accelerators", "cuda"));
  let worker: ChildProcess | undefined,
    directory = "",
    activeDevice: SearchDevice = "cpu",
    nextId = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let closed = false,
    processing = false;
  const root = (kind: "embedding" | "caption", download: boolean) => {
    const key = `${kind}:${download}`;
    let promise = roots.get(key);
    if (!promise) {
      promise = (async () => {
        const group = manifest[kind];
        if (bundled) {
          const location = join(bundled, group.repo);
          let valid = true;
          for (const asset of group.assets)
            if (!(await matches(join(location, asset.path), asset.sha256))) {
              valid = false;
              break;
            }
          if (valid) return location;
        }
        const location = join(cache, "search", group.repo);
        for (const asset of group.assets)
          await ensureAsset(join(location, asset.path), asset, download);
        return location;
      })().catch((error: unknown) => {
        roots.delete(key);
        throw error;
      });
      roots.set(key, promise);
    }
    return promise;
  };
  const retire = async () => {
    clearTimeout(idle);
    idle = undefined;
    const previous = worker;
    worker = undefined;
    directory = "";
    if (previous?.pid && previous.exitCode === null && previous.signalCode === null) {
      await new Promise<void>((resolve) => {
        previous.once("exit", () => resolve());
        previous.kill("SIGKILL");
      });
    }
  };
  const invoke = (current: ChildProcess, call: Pending) =>
    new Promise<Float32Array | string>((resolve, reject) => {
      const id = ++nextId;
      const cleanup = () => {
        clearTimeout(timer);
        current.off("message", message);
        current.off("error", fail);
        current.off("exit", exited);
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const exited = (code: number | null) => fail(new Error(`Search worker exited (${code})`));
      const message = (reply: { id?: number; result?: Float32Array | string; error?: string }) => {
        if (reply.id !== id) return;
        cleanup();
        if (reply.error || reply.result == null)
          reject(new Error(reply.error ?? "Search model returned no result"));
        else resolve(reply.result);
      };
      const timer = setTimeout(() => fail(new Error("Local search model timed out")), 120_000);
      current.on("message", message);
      current.once("error", fail);
      current.once("exit", exited);
      current.send({ id, directory: call.directory, request: call.request }, (error) => {
        if (error) fail(error);
      });
    });
  const execute = async (call: Pending, device: SearchDevice) => {
    if (directory !== call.directory || activeDevice !== device) await retire();
    if (closed) throw new Error("Search models are closed");
    if (!worker) {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        INKLING_SEARCH_DEVICE: device,
        INKLING_SEARCH_TEXT_ONLY: options.queryOnly ? "1" : "0",
      };
      if (existsSync(accelerators)) {
        env.LD_LIBRARY_PATH = [accelerators, process.env.LD_LIBRARY_PATH]
          .filter(Boolean)
          .join(delimiter);
        if (process.platform === "win32")
          env.PATH = [accelerators, process.env.PATH].filter(Boolean).join(delimiter);
      }
      worker = fork(workerUrl, [], {
        serialization: "advanced",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env,
        execArgv: [],
      });
      directory = call.directory;
      activeDevice = device;
    }
    const result = await invoke(worker, call);
    options.onDevice?.(device, cpuOnly.has(call.directory));
    return result;
  };
  const drain = async () => {
    if (processing) return;
    processing = true;
    try {
      while (queue.length) {
        if (closed) break;
        const call = queue.shift();
        if (!call) break;
        try {
          const device = cpuOnly.has(call.directory) ? "cpu" : preferred;
          call.resolve(
            await withCpuFallback(
              device,
              (selected) => execute(call, selected),
              async () => {
                cpuOnly.add(call.directory);
                await retire();
              },
            ),
          );
        } catch (error) {
          call.reject(error instanceof Error ? error : new Error(String(error)));
          await retire();
        }
      }
    } finally {
      processing = false;
      if (!closed && worker)
        idle = setTimeout(() => {
          void retire();
        }, 60_000);
    }
  };
  const run = async (request: SearchModelRequest, download = true) => {
    if (closed) throw new Error("Search models are closed");
    const location = await root(request.kind === "caption" ? "caption" : "embedding", download);
    if (closed) throw new Error("Search models are closed");
    if (queue.length >= 32) throw new Error("Search model queue is full");
    clearTimeout(idle);
    idle = undefined;
    return new Promise<Float32Array | string>((resolve, reject) => {
      const call = { directory: location, request, resolve, reject };
      if (request.kind === "query") queue.unshift(call);
      else queue.push(call);
      void drain();
    });
  };
  const vector = async (request: SearchModelRequest, download = true) => {
    const result = await run(request, download);
    if (!(result instanceof Float32Array))
      throw new Error("Search model returned invalid vector data");
    return result;
  };
  const embedQuery = (text: string) => {
    const key = text.trim(),
      cached = queries.get(key);
    if (cached) return cached;
    const pendingQuery = options.queryOnly
      ? vector({ kind: "query", text: key }, false)
      : (queryModels ??= createSearchModels(cache, bundled, {
          ...options,
          device: "cpu",
          queryOnly: true,
        })).embedQuery(key);
    const promise = pendingQuery.catch((error: unknown) => {
      queries.delete(key);
      throw error;
    });
    queries.set(key, promise);
    if (queries.size > 32) queries.delete(queries.keys().next().value ?? "");
    return promise;
  };
  return {
    embedQuery,
    embedText: (text: string, title?: string) => vector({ kind: "text", text, title }),
    embedImage: (bytes: Uint8Array) => vector({ kind: "image", bytes }),
    caption: async (bytes: Uint8Array) => {
      const result = await run({ kind: "caption", bytes });
      if (typeof result !== "string") throw new Error("Caption model returned invalid text");
      return result;
    },
    close: async () => {
      closed = true;
      queries.clear();
      for (const call of queue.splice(0)) call.reject(new Error("Search models are closed"));
      await Promise.all([retire(), queryModels?.close()]);
    },
  };
}
