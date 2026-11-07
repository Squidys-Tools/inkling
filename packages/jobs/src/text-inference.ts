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
export function startTextInference(
  modelPath: string,
  onStopped: () => void,
  {
    idleMillis,
    thread = new Worker(threadUrl, { workerData: { modelPath } }),
  }: { idleMillis?: number; thread?: Worker } = {},
) {
  const waiting = new Map<
    number,
    ReturnType<typeof Promise.withResolvers<TextInferenceResponse>>
  >();
  let stopped: Error | undefined;
  let nextId = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const stop = (error: Error) => {
    clearTimeout(idle);
    stopped ??= error;
    for (const { reject } of waiting.values()) reject(stopped);
    waiting.clear();
    onStopped();
  };
  // Armed only with nothing waiting, and the next window clears it in the same turn as the reply
  // before it, so a document between windows is never closed under its own feet.
  const armIdle = () => {
    if (idleMillis === undefined || waiting.size > 0 || stopped) return;
    idle = setTimeout(() => {
      stop(new Error("text inference closed while idle"));
      void thread.terminate();
    }, idleMillis);
    idle.unref();
  };
  thread.unref();
  thread.on("message", (response: TextInferenceResponse) => {
    const reply = waiting.get(response.id);
    waiting.delete(response.id);
    if (response.error === undefined) reply?.resolve(response);
    else reply?.reject(new Error(response.error));
    armIdle();
  });
  thread.once("error", stop);
  thread.once("exit", (code) => stop(new Error(`text inference stopped with code ${code}`)));
  return (window: TextWindow) => {
    if (stopped) return Promise.reject(stopped);
    clearTimeout(idle);
    const id = nextId++;
    const reply = Promise.withResolvers<TextInferenceResponse>();
    waiting.set(id, reply);
    thread.postMessage({ id, ...window } satisfies TextInferenceRequest);
    return reply.promise;
  };
}
