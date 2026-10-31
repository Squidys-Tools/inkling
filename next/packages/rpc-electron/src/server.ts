import type { MessagePortMain } from "electron";
import { Cause, Effect, Exit, Fiber, Layer, Queue, Scope } from "effect";
import { RpcServer } from "effect/rpc";
import { WorkerRunner } from "effect/workers";

/** Hands each port that connects to `onPort`, and returns a function that stops listening. */
export type PortSource = (onPort: (port: MessagePortMain) => void) => () => void;

/**
 * Ports main hands to this utility process, one per client (each window, main
 * itself, the worker process). Main sends them as `{ type: "connect" }` with the
 * port attached.
 */
export const parentPortSource: PortSource = (onPort) => {
  const listener = (event: Electron.MessageEvent) => {
    if ((event.data as { type?: unknown } | null)?.type !== "connect") return;
    for (const port of event.ports) onPort(port);
  };
  process.parentPort.on("message", listener);
  return () => process.parentPort.off("message", listener);
};

// Speaks Effect's worker wire format (`[0, request]` / `[1]` in, `[0]` ready /
// `[1, response]` out) on every connected port, with the port's number as the
// RPC client id, so one server answers many clients.
const runnerPlatform = (source: PortSource) =>
  WorkerRunner.WorkerRunnerPlatform.of({
    start: <O, I>() =>
      Effect.gen(function* () {
        const ports = new Map<number, MessagePortMain>();
        const disconnects = yield* Queue.make<number>();
        let nextId = 0;

        const sendUnsafe = (portId: number, message: O) => {
          // MessagePortMain can only transfer ports, so buffers are copied.
          ports.get(portId)?.postMessage([1, message]);
        };
        const send = (portId: number, message: O) => Effect.sync(() => sendUnsafe(portId, message));

        const run = <A, E, R>(
          handler: (portId: number, message: I) => Effect.Effect<A, E, R> | void,
        ) =>
          Effect.scopedWith(
            Effect.fnUntraced(function* (scope) {
              const services = yield* Effect.context<R>();
              const runFork = Effect.runForkWith(services);
              const track = Fiber.runIn(scope);
              const logFailure = (exit: Exit.Exit<A, E>) => {
                if (exit._tag === "Failure" && !Cause.hasInterruptsOnly(exit.cause))
                  runFork(Effect.logError("unhandled error in RPC handler", exit.cause));
              };
              const close = (portId: number) => {
                const port = ports.get(portId);
                if (!port) return;
                ports.delete(portId);
                port.close();
                Queue.offerUnsafe(disconnects, portId);
              };
              const stop = source((port) => {
                const portId = nextId++;
                ports.set(portId, port);
                port.on("message", ({ data }) => {
                  const message = data as WorkerRunner.PlatformMessage<I>;
                  if (message[0] === 1) return close(portId);
                  const result = handler(portId, message[1]);
                  if (!Effect.isEffect(result)) return;
                  const fiber = runFork(result);
                  fiber.addObserver(logFailure);
                  track(fiber);
                });
                port.on("close", () => close(portId));
                port.start();
                port.postMessage([0]);
              });
              yield* Scope.addFinalizer(
                scope,
                Effect.sync(() => {
                  stop();
                  for (const portId of ports.keys()) close(portId);
                }),
              );
              return yield* Effect.never;
            }),
          );

        return { run, send, sendUnsafe, disconnects };
      }),
  });

/** The RPC server `Protocol` for a utility process that main feeds ports to. */
export const layerProtocol = (source: PortSource = parentPortSource) =>
  RpcServer.layerProtocolWorkerRunner.pipe(
    Layer.provide(Layer.succeed(WorkerRunner.WorkerRunnerPlatform)(runnerPlatform(source))),
  );
