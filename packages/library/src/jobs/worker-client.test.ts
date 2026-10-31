import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageChannel, type MessagePort } from "node:worker_threads";
import type { MessagePortMain } from "electron";
import { TEXT_MODEL, WorkerRpcs } from "@inkling/contracts/jobs";
import { type Embeddings, workerHandlersLayer } from "@inkling/jobs/handlers";
import { layerProtocol, type PortSource } from "@inkling/rpc-electron/server";
import { Effect, Fiber, Layer, ManagedRuntime } from "effect";
import { RpcServer } from "effect/rpc";
import { queryVector } from "./query-vector.ts";
import { unusedModels } from "./test-jobs.ts";
import { JobPostponed } from "../storage/worker.ts";
import { JobsWorker, layerPorts, workerClient } from "./worker-client.ts";

const root = mkdtempSync(join(tmpdir(), "inkling-worker-client-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// Node's MessagePort emits bare data; Electron's MessagePortMain wraps it in an event.
function electronPort(port: MessagePort) {
  const wrapped = new Map<unknown, (...args: unknown[]) => void>();
  return {
    on(event: string, listener: (...args: unknown[]) => void) {
      const handler =
        event === "message" ? (data: unknown) => listener({ data, ports: [] }) : listener;
      wrapped.set(listener, handler);
      port.on(event, handler);
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      port.off(event, wrapped.get(listener) ?? listener);
    },
    start: () => port.start(),
    postMessage: (message: unknown) => port.postMessage(message),
    close: () => port.close(),
  } as unknown as MessagePortMain;
}

function startWorker(embedQuery: Embeddings["embedQuery"]) {
  const { port1, port2 } = new MessageChannel();
  const source: PortSource = (onPort) => {
    onPort(electronPort(port1));
    return () => {};
  };
  const server = RpcServer.layer(WorkerRpcs).pipe(
    Layer.provide(
      workerHandlersLayer({
        modelCacheDirectory: root,
        ...unusedModels,
        embeddings: { ...unusedModels.embeddings, embedQuery },
      }),
    ),
    Layer.provide(layerProtocol(source)),
  );
  const fiber = Effect.runFork(Layer.launch(server));
  return {
    port: electronPort(port2),
    // A crashed process answers nothing more; its end of the channel just closes.
    crash: () => port1.close(),
    stop: () => Effect.runPromise(Fiber.interrupt(fiber)),
  };
}

const answering = (values: number[]) => async () => {
  const vector = Float32Array.from(values);
  return { vector, model: TEXT_MODEL, bytes: Buffer.from(vector.buffer) };
};

test("worker calls are postponed without a port, fail when the worker dies, and resume on the next port", async () => {
  let offer: (port: MessagePortMain) => void = () => {};
  const runtime = ManagedRuntime.make(
    layerPorts((onPort) => {
      offer = onPort;
      return () => {};
    }),
  );
  const embed = (text: string) =>
    runtime.runPromise(workerClient.pipe(Effect.flatMap((worker) => worker.embedQuery({ text }))));
  const postponed = () => runtime.runPromise(Effect.flip(workerClient));
  const connected = () => runtime.runPromise(JobsWorker.use((worker) => worker.connected));
  try {
    expect(await postponed()).toBeInstanceOf(JobPostponed);
    // regression: with no worker, every search waited five seconds before ranking by text.
    expect(await runtime.runPromise(queryVector("no worker yet"))).toBeNull();
    const beforeStart = connected();
    const entered = Promise.withResolvers<void>();
    const held = Promise.withResolvers<never>();
    let calls = 0;
    const first = startWorker(async () => {
      calls += 1;
      if (calls === 1) return answering([1, 0])();
      entered.resolve();
      return held.promise;
    });
    offer(first.port);
    await beforeStart;
    expect(await embed("first")).toEqual([1, 0]);

    const inFlight = embed("held");
    await entered.promise;
    first.crash();
    await expect(inFlight).rejects.toThrow();
    await first.stop();
    expect(await postponed()).toBeInstanceOf(JobPostponed);

    const afterDeath = connected();
    const second = startWorker(answering([0, 1]));
    offer(second.port);
    await afterDeath;
    expect(await embed("again")).toEqual([0, 1]);
    await second.stop();
  } finally {
    await runtime.dispose();
  }
});

test("a query the worker cannot embed searches by text alone", async () => {
  const failing = startWorker(async () => {
    throw new Error("model assets are unavailable for search");
  });
  const runtime = ManagedRuntime.make(
    layerPorts((onPort) => {
      onPort(failing.port);
      return () => {};
    }),
  );
  try {
    expect(await runtime.runPromise(queryVector("quiet telescope"))).toBeNull();
    expect(await runtime.runPromise(queryVector("   "))).toBeNull();
  } finally {
    await runtime.dispose();
    await failing.stop();
  }
});
