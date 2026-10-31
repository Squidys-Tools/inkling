import type { MessagePortMain } from "electron";
import { Deferred, Effect, Layer, Scope } from "effect";
import { Worker, WorkerError } from "effect/workers";

// The client half for Node-side callers (main, the worker process), whose ports
// are MessagePortMain: an EventEmitter that reports `close` when the other end dies.
export const layerPlatform = (port: MessagePortMain) =>
  Layer.merge(
    Layer.succeed(Worker.WorkerPlatform)(
      Worker.makePlatform<MessagePortMain>()({
        setup: ({ worker, scope }) =>
          Effect.as(
            Scope.addFinalizer(
              scope,
              Effect.sync(() => worker.postMessage([1])),
            ),
            worker,
          ),
        listen: ({ port: listening, emit, deferred, scope }) => {
          const onMessage = ({ data }: Electron.MessageEvent) => emit(data);
          const onClose = () =>
            Deferred.doneUnsafe(
              deferred,
              Effect.fail(
                new WorkerError.WorkerError({
                  reason: new WorkerError.WorkerReceiveError({ message: "the port closed" }),
                }),
              ),
            );
          listening.on("message", onMessage);
          listening.on("close", onClose);
          listening.start();
          return Scope.addFinalizer(
            scope,
            Effect.sync(() => {
              listening.off("message", onMessage);
              listening.off("close", onClose);
            }),
          );
        },
      }),
    ),
    Worker.layerSpawner(() => port),
  );
