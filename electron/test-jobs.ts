import { afterAll, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAiJobProcessors as createProcessors } from "./ai-jobs.ts";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.ts";
import type { Job } from "./storage/jobs.ts";
import type { JobQueue, Library, LibraryOptions } from "./storage/library.ts";
import type { TestLibrary } from "./storage/test-library.ts";
import {
  closeAll,
  removeTemporaryRoots,
  temporaryRoot,
  trackedLibrary,
} from "./storage/test-helpers.ts";
import type { WorkerOptions } from "./storage/worker.ts";
import { createImageThumbnail, inspectImage } from "./thumbnail.ts";

type Ai = ReturnType<typeof createProcessors>;
type LaneOptions = Omit<WorkerOptions<Library | JobQueue>, "processors">;

const processors = new Set<Ai>();

export function createAiJobProcessors(options: Parameters<typeof createProcessors>[0]) {
  const ai = createProcessors(options);
  processors.add(ai);
  return ai;
}

export async function closeProcessors(ai: Ai) {
  processors.delete(ai);
  await ai.close();
}

export async function openLibrary(
  path: string,
  { media, ...options }: Omit<LibraryOptions, "databasePath"> = {},
) {
  return trackedLibrary(path, {
    media: { createThumbnail: createImageThumbnail, inspectImage, ...media },
    ...options,
  });
}

export async function temporaryLibrary(options: Omit<LibraryOptions, "databasePath"> = {}) {
  const root = temporaryRoot();
  return { root, library: await openLibrary(join(root, "library.sqlite3"), options) };
}

export function embedding(model: string) {
  const vector = Float32Array.from([1, 0]);
  const bytes = Buffer.alloc(8);
  bytes.writeFloatLE(1, 0);
  return { model, vector, bytes };
}

export const jobFor = (itemId: string) => ({ id: "direct", itemId }) as Job;

export const pdfFixture = (name: string) => readFileSync(`benchmarks/corpus/pdfs/${name}.pdf`);

export const savePdf = (library: TestLibrary, fileName: string, bytes: Uint8Array) =>
  library.saveFile({ fileName, mimeType: "application/pdf", kind: "pdf", bytes });

export const unusedModels = {
  ocr: { recognize: async () => "" },
  embeddings: {
    embedText: async () => embedding(TEXT_MODEL),
    embedQuery: async () => embedding(TEXT_MODEL),
    embedImage: async () => embedding(IMAGE_MODEL),
  },
};

export const imageFixture = () => readFileSync("benchmarks/corpus/images/image-columns-01.png");

export const saveImage = (library: TestLibrary, fileName = "photo.png") =>
  library.saveFile({ fileName, mimeType: "image/png", kind: "image", bytes: imageFixture() });

export const thumbnailLane = (library: TestLibrary, ai: Ai, options: LaneOptions = {}) =>
  library.worker({ processors: ai.thumbnailProcessors, ...options });

export function cleanUpJobTests() {
  afterEach(async () => {
    for (const ai of processors) await closeProcessors(ai);
    processors.clear();
    await closeAll();
  });
  afterAll(removeTemporaryRoots);
}
