import { Effect, Exit, Fiber, Layer, ManagedRuntime, Scope, Stream } from "effect";
import { type Rpc, RpcClient, type RpcGroup, RpcSchema } from "effect/rpc";
import type { Worker } from "effect/workers";

/**
 * Effect stops at this edge: UI code calls `client.search({...})` and gets a
 * promise, or `client.changes(onChange)` and gets an unsubscribe function.
 */
export type PromiseClient<Rpcs extends Rpc.Any> = {
  readonly [R in Rpcs as R["_tag"]]: R extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer Success,
    infer _Error,
    infer _Middleware,
    infer _Requires
  >
    ? [Success] extends [RpcSchema.Stream<infer A, infer _E>]
      ? (onValue: (value: A["Type"]) => void) => () => void
      : (payload: Rpc.PayloadConstructor<R>) => Promise<Success["Type"]>
    : never;
};

export type Connection<Rpcs extends Rpc.Any> = {
  client: PromiseClient<Rpcs>;
  close: () => Promise<void>;
};

/**
 * Opens a client for `group` over one port. Requests run concurrently: a stream
 * such as `changes` holds its pool slot for as long as it runs, and the pool's
 * default of one slot would queue every other call behind it.
 */
export async function connect<Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  platform: Layer.Layer<Worker.WorkerPlatform | Worker.Spawner>,
): Promise<Connection<Rpcs>> {
  const runtime = ManagedRuntime.make(
    RpcClient.layerProtocolWorker({ size: 1, concurrency: Number.MAX_SAFE_INTEGER }).pipe(
      Layer.provide(platform),
    ),
  );
  const scope = Effect.runSync(Scope.make());
  const rpc = (await runtime.runPromise(
    RpcClient.make(group).pipe(Scope.provide(scope)),
  )) as Record<
    string,
    (payload: unknown) => Effect.Effect<unknown, unknown> | Stream.Stream<unknown, unknown>
  >;

  const client: Record<string, unknown> = {};
  for (const [tag, definition] of group.requests) {
    const { successSchema } = definition as unknown as Rpc.AnyWithProps;
    client[tag] = RpcSchema.isStreamSchema(successSchema)
      ? (onValue: (value: unknown) => void) => {
          const stream = rpc[tag]({}) as Stream.Stream<unknown, unknown>;
          const fiber = runtime.runFork(
            Stream.runForEach(stream, (value) => Effect.sync(() => onValue(value))),
          );
          return () => void runtime.runFork(Fiber.interrupt(fiber));
        }
      : (payload: unknown) =>
          runtime.runPromise(rpc[tag](payload) as Effect.Effect<unknown, unknown>);
  }

  return {
    client: client as PromiseClient<Rpcs>,
    close: async () => {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await runtime.dispose();
    },
  };
}
