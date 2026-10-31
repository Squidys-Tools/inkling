import { afterAll, afterEach } from "bun:test";
import { join } from "node:path";
import { IMAGE_MODEL, TEXT_MODEL, WorkerRpcs } from "@inkling/contracts/jobs";
import { type WorkerOptions, workerHandlersLayer } from "@inkling/jobs/handlers";
import { fixture } from "@inkling/jobs/test-fixtures";
import { Effect, Exit, ManagedRuntime, Scope } from "effect";
import { RpcTest } from "effect/rpc";
import type { Job } from "../storage/jobs.ts";
import type { JobQueue, Library, LibraryOptions } from "../storage/library.ts";
import type { TestLibrary } from "../storage/test-library.ts";
import {
  closeAll,
  removeTemporaryRoots,
  temporaryRoot,
  trackedLibrary,
} from "../storage/test-helpers.ts";
import type { Processor, WorkerOptions as LaneOptions } from "../storage/worker.ts";
import { createJobProcessors } from "./processors.ts";
import { JobsWorker } from "./worker-client.ts";

type Jobs = Awaited<ReturnType<typeof createJobs>>;
const open = new Set<Jobs>();

export function embedding(model: string) {
  const vector = Float32Array.from([1, 0]);
  const bytes = Buffer.alloc(8);
  bytes.writeFloatLE(1, 0);
  return { model, vector, bytes };
}

export const unusedModels = {
  ocr: { recognize: async () => "" },
  embeddings: {
    embedText: async () => embedding(TEXT_MODEL),
    embedQuery: async () => embedding(TEXT_MODEL),
    embedImage: async () => embedding(IMAGE_MODEL),
  },
};

/**
 * The library's processors against the worker's real handlers, joined by the
 * in-memory RPC transport so every payload still passes its schema.
 */
export async function createJobs(root: string, options: Partial<WorkerOptions> = {}) {
  const runtime = ManagedRuntime.make(
    workerHandlersLayer({ modelCacheDirectory: join(root, "models"), ...unusedModels, ...options }),
  );
  const scope = Scope.makeUnsafe();
  const client = await runtime.runPromise(Scope.provide(RpcTest.makeClient(WorkerRpcs), scope));
  const worker = JobsWorker.of({ client: Effect.succeed(client) });
  const withWorker = (set: Record<string, Processor<Library | JobQueue | JobsWorker>>) =>
    Object.fromEntries(
      Object.entries(set).map(([kind, processor]) => [
        kind,
        ((job, workerId) =>
          processor(job, workerId).pipe(
            Effect.provideService(JobsWorker, worker),
          )) satisfies Processor<Library | JobQueue>,
      ]),
    );
  const created = createJobProcessors();
  const jobs = {
    client,
    processors: withWorker(created.processors),
    thumbnailProcessors: withWorker(created.thumbnailProcessors),
    onIdle: created.onIdle,
    close: async () => {
      open.delete(jobs);
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await runtime.dispose();
    },
  };
  open.add(jobs);
  return jobs;
}

export async function openLibrary(
  path: string,
  { media, ...options }: Omit<LibraryOptions, "databasePath"> = {},
) {
  const { inspectImage } = await import("@inkling/jobs/thumbnail");
  return trackedLibrary(path, { media: { inspectImage, ...media }, ...options });
}

export async function temporaryLibrary(options: Omit<LibraryOptions, "databasePath"> = {}) {
  const root = temporaryRoot();
  return { root, library: await openLibrary(join(root, "library.sqlite3"), options) };
}

export const jobFor = (itemId: string) => ({ id: "direct", itemId }) as Job;

export const pdfFixture = (name: string) => fixture(`${name}.pdf`);

export const savePdf = (library: TestLibrary, fileName: string, bytes: Uint8Array) =>
  library.saveFile({ fileName, mimeType: "application/pdf", kind: "pdf", bytes });

export const imageFixture = () => fixture("image-columns-01.png");

export const saveImage = (library: TestLibrary, fileName = "photo.png") =>
  library.saveFile({ fileName, mimeType: "image/png", kind: "image", bytes: imageFixture() });

export const thumbnailLane = (
  library: TestLibrary,
  jobs: Jobs,
  options: Omit<LaneOptions<Library | JobQueue>, "processors"> = {},
) => library.worker({ processors: jobs.thumbnailProcessors, ...options });

export function cleanUpJobTests() {
  afterEach(async () => {
    for (const jobs of open) await jobs.close();
    await closeAll();
  });
  afterAll(removeTemporaryRoots);
}
