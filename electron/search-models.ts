import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { ensureAsset } from "./embeddings.ts";
import manifest from "./search-model-manifest.json" with { type: "json" };
import type { SearchModelRequest } from "./search-runtime.ts";

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
async function matches(path: string, expected: string) {
  try {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex") === expected;
  } catch {
    return false;
  }
}

export function createSearchModels(cache: string, bundled?: string) {
  const roots = new Map<string, Promise<string>>();
  const queue: Pending[] = [];
  const queries = new Map<string, Promise<Float32Array>>();
  let worker: Worker | undefined,
    directory = "",
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
    if (previous) await previous.terminate();
  };
  const invoke = (current: Worker, call: Pending) =>
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
      const exited = (code: number) => fail(new Error(`Search worker exited (${code})`));
      const message = (reply: { id: number; result?: Float32Array | string; error?: string }) => {
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
      current.postMessage({ id, directory: call.directory, request: call.request });
    });
  const drain = async () => {
    if (processing) return;
    processing = true;
    try {
      while (queue.length) {
        if (closed) break;
        const call = queue.shift();
        if (!call) break;
        try {
          // A fresh thread reclaims ORT's native arenas when the model changes.
          if (directory !== call.directory) await retire();
          if (closed) throw new Error("Search models are closed");
          worker ??= new Worker(workerUrl);
          directory = call.directory;
          call.resolve(await invoke(worker, call));
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
    const promise = vector({ kind: "query", text: key }, false).catch((error: unknown) => {
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
      await retire();
    },
  };
}
