import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

export type TextWindow = { ids: number[]; typeIds: number[]; mask: number[] };
export type TextInferenceRequest = TextWindow & { id: number };
export type TextInferenceResponse = {
  id: number;
  dims?: readonly number[];
  data?: Float32Array;
  error?: string;
};

// Source runs as .ts under Bun and as bundled .mjs in the app; the thread sits beside it either way.
const threadUrl = new URL(
  `./text-inference-thread${extname(fileURLToPath(import.meta.url))}`,
  import.meta.url,
);

/**
 * onnxruntime-node's `run` holds the calling thread, and a long window takes up to a minute.
 * On the worker's own thread that stops every download, thumbnail and reply until it ends.
 */
export function startTextInference(modelPath: string, onStopped: () => void) {
  const waiting = new Map<
    number,
    ReturnType<typeof Promise.withResolvers<TextInferenceResponse>>
  >();
  let stopped: Error | undefined;
  let nextId = 0;
  const stop = (error: Error) => {
    stopped ??= error;
    for (const { reject } of waiting.values()) reject(stopped);
    waiting.clear();
    onStopped();
  };
  const thread = new Worker(threadUrl, { workerData: { modelPath } });
  thread.unref();
  thread.on("message", (response: TextInferenceResponse) => {
    const reply = waiting.get(response.id);
    waiting.delete(response.id);
    if (response.error === undefined) reply?.resolve(response);
    else reply?.reject(new Error(response.error));
  });
  thread.once("error", stop);
  thread.once("exit", (code) => stop(new Error(`text inference stopped with code ${code}`)));
  const infer = (window: TextWindow) => {
    if (stopped) return Promise.reject(stopped);
    const id = nextId++;
    const reply = Promise.withResolvers<TextInferenceResponse>();
    waiting.set(id, reply);
    thread.postMessage({ id, ...window } satisfies TextInferenceRequest);
    return reply.promise;
  };
  return { infer, close: () => void thread.terminate() };
}
