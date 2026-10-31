import type { MessagePortMain } from "electron";
import { WorkerRpcs } from "@inkling/contracts/jobs";
import { layerPlatform } from "@inkling/rpc-electron/client-main";
import type { PortSource } from "@inkling/rpc-electron/server";
import { Context, Deferred, Effect, Exit, Layer, Scope } from "effect";
import { RpcClient, type RpcClientError, type RpcGroup } from "effect/rpc";
import { JobPostponed } from "../storage/worker.ts";

export type WorkerClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof WorkerRpcs>,
  RpcClientError.RpcClientError
>;

/**
 * The worker process. `client` fails with `JobPostponed` at once while main
 * starts or restarts it, or has given up on it; `connected` waits for it.
 */
export class JobsWorker extends Context.Service<
  JobsWorker,
  {
    readonly client: Effect.Effect<WorkerClient, JobPostponed>;
    readonly connected: Effect.Effect<void>;
  }
>()("inkling/jobs/JobsWorker") {}

export const workerClient = JobsWorker.use((worker) => worker.client);

/**
 * One client per port main hands over. When the worker dies its port closes:
 * calls in flight fail and spend a retry, so a job that crashes the worker
 * cannot loop, while new calls are postponed until the next port.
 */
export const layerPorts = (source: PortSource) =>
  Layer.effect(
    JobsWorker,
    Effect.gen(function* () {
      let ready = Deferred.makeUnsafe<WorkerClient>();
      let current: Scope.Closeable | undefined;
      const runFork = Effect.runForkWith(yield* Effect.context<never>());

      const connect = Effect.fnUntraced(function* (port: MessagePortMain) {
        const scope = yield* Scope.make();
        const protocol = yield* Layer.buildWithScope(
          RpcClient.layerProtocolWorker({ size: 1, concurrency: Number.MAX_SAFE_INTEGER }).pipe(
            Layer.provide(layerPlatform(port)),
          ),
          scope,
        );
        const client = yield* RpcClient.make(WorkerRpcs).pipe(
          Effect.provideContext(protocol),
          Scope.provide(scope),
        );
        const previous = current;
        current = scope;
        if (Deferred.isDoneUnsafe(ready)) ready = Deferred.makeUnsafe();
        Deferred.doneUnsafe(ready, Effect.succeed(client));
        // Closing this client now would race the protocol error that fails its
        // calls in flight, leaving them waiting forever; the next port closes it.
        port.on("close", () => {
          if (current === scope && Deferred.isDoneUnsafe(ready)) ready = Deferred.makeUnsafe();
        });
        if (previous) yield* Scope.close(previous, Exit.void);
      });

      const stop = source((port) =>
        runFork(
          connect(port).pipe(
            Effect.catchCause((cause) => Effect.logError("worker connection failed", cause)),
          ),
        ),
      );
      yield* Effect.addFinalizer(() =>
        Effect.suspend(() => {
          stop();
          return current ? Scope.close(current, Exit.void) : Effect.void;
        }),
      );
      const unavailable = new JobPostponed({ reason: "the worker process is not running" });
      return {
        client: Effect.suspend(() =>
          Deferred.isDoneUnsafe(ready) ? Deferred.await(ready) : Effect.fail(unavailable),
        ),
        connected: Effect.suspend(() => Deferred.await(ready)).pipe(Effect.asVoid),
      };
    }),
  );
