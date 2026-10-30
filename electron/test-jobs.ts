import { afterAll, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAiJobProcessors as createProcessors } from "./ai-jobs.ts";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.ts";
import type { Job } from "./storage/jobs.ts";
import type { JobQueue, Library, LibraryOptions } from "./storage/library.ts";
import { openTestLibrary, type TestLibrary } from "./storage/test-library.ts";
import type { WorkerOptions } from "./storage/worker.ts";
import { createImageThumbnail, inspectImage } from "./thumbnail.ts";

type Ai = ReturnType<typeof createProcessors>;
type LaneOptions = Omit<WorkerOptions<Library | JobQueue>, "processors">;

const roots: string[] = [];
const libraries = new Set<TestLibrary>();
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
  const library = await openTestLibrary(path, {
    media: { createThumbnail: createImageThumbnail, inspectImage, ...media },
    ...options,
  });
  libraries.add(library);
  return library;
}

export async function temporaryLibrary(options: Omit<LibraryOptions, "databasePath"> = {}) {
  const root = mkdtempSync(join(tmpdir(), "inkling-electron-ai-"));
  roots.push(root);
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

export async function savePdf(library: TestLibrary, fileName: string, bytes: Uint8Array) {
  const item = await library.saveFile({
    fileName,
    mimeType: "application/pdf",
    kind: "pdf",
    bytes,
  });
  if (!item) throw new Error("PDF was not saved");
  return item;
}

export const unusedModels = {
  ocr: { recognize: async () => "" },
  embeddings: {
    embedText: async () => embedding(TEXT_MODEL),
    embedQuery: async () => embedding(TEXT_MODEL),
    embedImage: async () => embedding(IMAGE_MODEL),
  },
};

export const imageFixture = () => readFileSync("benchmarks/corpus/images/image-columns-01.png");

export async function saveImage(library: TestLibrary, fileName = "photo.png") {
  const item = await library.saveFile({
    fileName,
    mimeType: "image/png",
    kind: "image",
    bytes: imageFixture(),
  });
  if (!item) throw new Error("image was not saved");
  return item;
}

export const thumbnailLane = (library: TestLibrary, ai: Ai, options: LaneOptions = {}) =>
  library.worker({ processors: ai.thumbnailProcessors, ...options });

export async function closeLibrary(library: TestLibrary) {
  libraries.delete(library);
  await library.close();
}

export function cleanUpJobTests() {
  afterEach(async () => {
    for (const ai of processors) await closeProcessors(ai);
    processors.clear();
    for (const library of libraries) await library.close();
    libraries.clear();
    Bun.gc(true);
  });

  afterAll(() => {
    Bun.gc(true);
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
}
