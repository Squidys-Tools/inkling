import {
  type ShellThumbnailReply,
  type ShellThumbnailRequest,
  WorkerRpcs,
} from "@inkling/contracts/jobs";
import { layerProtocol } from "@inkling/rpc-electron/server";
import { Effect, Fiber, Layer } from "effect";
import { RpcServer } from "effect/rpc";
import { randomUUID } from "node:crypto";
import { workerHandlersLayer } from "./handlers.ts";
import type { ShellThumbnail } from "./video-poster.ts";

// The worker process: OCR, embeddings, thumbnails, PDF and URL extraction. Main
// starts it and hands it one port per client, which today is the library process.
const flag = (name: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const modelCacheDirectory = flag("--model-cache-directory");
if (!modelCacheDirectory) throw new Error("--model-cache-directory is required");

const pending = new Map<string, (png: Uint8Array | null) => void>();
// Linux has no shell thumbnailer, so its posters come from the local decoder alone.
const shell: ShellThumbnail | undefined =
  process.platform === "linux"
    ? undefined
    : (path, edge) =>
        new Promise((resolve) => {
          const id = randomUUID();
          pending.set(id, resolve);
          const request: ShellThumbnailRequest = { type: "shell-thumbnail", id, path, edge };
          process.parentPort.postMessage(request);
        });

const server = RpcServer.layer(WorkerRpcs).pipe(
  Layer.provide(
    workerHandlersLayer({
      modelCacheDirectory,
      bundledModelDirectory: flag("--bundled-model-directory"),
      shell,
    }),
  ),
  Layer.provide(layerProtocol()),
);

const launched: Effect.Effect<never, unknown> = Layer.launch(server);
const fiber = Effect.runFork(launched);

process.parentPort.on("message", ({ data }) => {
  const message = data as { type?: unknown } | null;
  if (message?.type === "shell-thumbnail") {
    const reply = message as ShellThumbnailReply;
    pending.get(reply.id)?.(reply.png);
    pending.delete(reply.id);
  }
  // Interrupting the server stops the OCR worker thread before the process exits.
  if (message?.type === "shutdown")
    Effect.runFork(Fiber.interrupt(fiber)).addObserver(() => process.exit(0));
});
