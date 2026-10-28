import { afterAll, afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createAiJobProcessors } from "./ai-jobs.ts";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.ts";
import { VIDEO_POSTER_JOB } from "./storage/library.ts";
import { openTestLibrary, type TestLibrary } from "./storage/test-library.ts";
import { createImageThumbnail } from "./thumbnail.ts";
import { createVideoPoster } from "./video-poster.ts";

type ShellImage = { isEmpty(): boolean; toPNG(): Buffer };

const roots: string[] = [];
const libraries: TestLibrary[] = [];
const processors: ReturnType<typeof createAiJobProcessors>[] = [];

afterEach(async () => {
  for (const ai of processors.splice(0)) await ai.close();
  for (const library of libraries.splice(0)) await library.close();
  Bun.gc(true);
});

afterAll(() => {
  Bun.gc(true);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const frame = await sharp({
  create: { width: 640, height: 360, channels: 3, background: "#335577" },
})
  .png()
  .toBuffer();
const shellFrame = async (): Promise<ShellImage> => ({ isEmpty: () => false, toPNG: () => frame });

const embedding = (model: string) => ({
  model,
  vector: new Float32Array(2),
  bytes: Buffer.alloc(8),
});
const models = {
  ocr: { recognize: async () => "" },
  embeddings: {
    embedText: async () => embedding(TEXT_MODEL),
    embedQuery: async () => embedding(TEXT_MODEL),
    embedImage: async () => embedding(IMAGE_MODEL),
  },
};

// Stands in for Electron's nativeImage; `thumbnail` decides what the shell returns.
function stubShell(thumbnail: () => Promise<ShellImage>) {
  const requested: { path: string; size: { width: number; height: number } }[] = [];
  return {
    requested,
    nativeImage: {
      createThumbnailFromPath: async (path: string, size: { width: number; height: number }) => {
        requested.push({ path, size });
        return thumbnail();
      },
    },
  };
}

async function setup(nativeImage: object) {
  const root = mkdtempSync(join(tmpdir(), "inkling-video-poster-"));
  roots.push(root);
  const events: string[] = [];
  const library = await openTestLibrary(join(root, "library.sqlite3"), {
    media: { createThumbnail: createImageThumbnail },
    jobQueue: { onUpdated: (id: string) => events.push(id) },
  });
  libraries.push(library);
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ...models,
    nativeImage,
    videoDecoderPath: null,
  });
  processors.push(ai);
  // Only the poster kind is claimed, so a drain never waits on model jobs.
  const worker = await library.worker({
    processors: { [VIDEO_POSTER_JOB]: ai.thumbnailProcessors[VIDEO_POSTER_JOB] },
    onIdle: ai.onIdle,
  });
  return { root, events, library, worker, ai };
}

async function saveVideo(library: TestLibrary, fileName: string) {
  const item = await library.saveFile({
    fileName,
    mimeType: "video/mp4",
    kind: "video",
    bytes: Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112]),
  });
  if (!item) throw new Error("video was not saved");
  return item;
}

const posterJobs = (library: TestLibrary) =>
  library.db
    .prepare("SELECT item_id, status, retry_count FROM jobs WHERE kind = ?")
    .all(VIDEO_POSTER_JOB);

test("a captured video gets its poster from a background job, not from capture", async () => {
  const shell = stubShell(shellFrame);
  const { root, events, library, worker } = await setup(shell.nativeImage);

  const video = await saveVideo(library, "clip.mp4");
  expect(shell.requested).toEqual([]);
  expect((await library.getItem(video.id))?.thumbnailPath).toBeNull();
  expect(posterJobs(library)).toEqual([{ item_id: video.id, status: "pending", retry_count: 0 }]);
  events.length = 0;

  await worker.drain();

  const posterPath = `assets/items/${video.id}/thumbnail.webp`;
  expect((await library.getItem(video.id))?.thumbnailPath).toBe(posterPath);
  expect(shell.requested).toHaveLength(1);
  expect(realpathSync.native(shell.requested[0].path)).toBe(
    realpathSync.native(join(root, "assets", "items", video.id, "clip.mp4")),
  );
  expect(shell.requested[0].size.width).toBe(512);
  // Read as bytes: sharp keeps a path-based input open, which blocks cleanup on Windows.
  expect(await sharp(readFileSync(join(root, posterPath))).metadata()).toMatchObject({
    format: "webp",
    width: 512,
  });
  expect(events).toEqual([video.id]);
  expect(posterJobs(library)).toEqual([{ item_id: video.id, status: "completed", retry_count: 0 }]);
});

const failures = [
  [
    "the shell returns an empty image",
    () => stubShell(async () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) })),
    4,
  ],
  [
    "the shell cannot read the file",
    () =>
      stubShell(async () => {
        throw new Error("no thumbnail handler");
      }),
    4,
  ],
  ["the platform has no shell thumbnailer", () => ({ requested: [], nativeImage: {} }), 0],
] as const;

for (const [name, makeShell, attempts] of failures) {
  test(`a video keeps its item and stops retrying when ${name}`, async () => {
    const shell = makeShell();
    const { root, events, library, worker, ai } = await setup(shell.nativeImage);
    const video = await saveVideo(library, "clip.mp4");

    await worker.drain();

    expect(await library.getItem(video.id)).toMatchObject({
      id: video.id,
      kind: "video",
      thumbnailPath: null,
    });
    expect(existsSync(join(root, "assets", "items", video.id, "clip.mp4"))).toBe(true);
    expect(existsSync(join(root, "assets", "items", video.id, "thumbnail.webp"))).toBe(false);
    expect(posterJobs(library)).toEqual([{ item_id: video.id, status: "failed", retry_count: 3 }]);
    expect(shell.requested).toHaveLength(attempts);

    events.length = 0;
    await worker.drain();
    await library.run(ai.onIdle());
    await worker.drain();
    expect(shell.requested).toHaveLength(attempts);
    expect(posterJobs(library)).toEqual([{ item_id: video.id, status: "failed", retry_count: 3 }]);
    expect(events).toEqual([]);
  });
}

test("backfill posters only local videos that have none and have not already failed", async () => {
  const shell = stubShell(shellFrame);
  const { root, library, worker } = await setup(shell.nativeImage);

  const legacy = await saveVideo(library, "legacy.mp4");
  const posted = await saveVideo(library, "posted.mp4");
  const broken = await saveVideo(library, "broken.mp4");
  const notes = await library.saveFile({
    fileName: "notes.txt",
    mimeType: "text/plain",
    kind: "file",
    bytes: Uint8Array.from([104, 105]),
  });
  if (!notes) throw new Error("file was not saved");
  library.db.prepare("DELETE FROM jobs").run();
  library.db
    .prepare("UPDATE items SET thumbnail_path = ? WHERE id = ?")
    .run(`assets/items/${posted.id}/thumbnail.webp`, posted.id);
  library.db
    .prepare(`INSERT INTO items (id, kind, title, source_url, created_at, updated_at)
      VALUES ('link-only', 'video', 'Link only', 'https://example.com/clip', 1, 1)`)
    .run();
  library.db
    .prepare(`INSERT INTO jobs (id, item_id, kind, status, retry_count, created_at)
      VALUES ('earlier-failure', ?, ?, 'failed', 3, 1)`)
    .run(broken.id, VIDEO_POSTER_JOB);

  await worker.drain();

  expect(shell.requested.map((request) => realpathSync.native(request.path))).toEqual([
    realpathSync.native(join(root, "assets", "items", legacy.id, "legacy.mp4")),
  ]);
  expect((await library.getItem(legacy.id))?.thumbnailPath).toBe(
    `assets/items/${legacy.id}/thumbnail.webp`,
  );
  expect((await library.getItem(broken.id))?.thumbnailPath).toBeNull();
  expect((await library.getItem(notes.id))?.thumbnailPath).toBeNull();
  expect((await library.getItem("link-only"))?.thumbnailPath).toBeNull();
  expect(Object.fromEntries(posterJobs(library).map((job) => [job.item_id, job.status]))).toEqual({
    [legacy.id]: "completed",
    [broken.id]: "failed",
  });

  await worker.drain();
  expect(shell.requested).toHaveLength(1);
});

test("the poster is the shell thumbnail at card size, or nothing", async () => {
  const png = Buffer.from("png");
  const asked: unknown[] = [];
  const thumbnailer = (image: ShellImage) => ({
    createThumbnailFromPath: async (...args: unknown[]) => {
      asked.push(args);
      return image;
    },
  });

  expect(
    await createVideoPoster("clip.mp4", {
      decoderPath: null,
      nativeImage: thumbnailer({ isEmpty: () => false, toPNG: () => png }),
    }),
  ).toBe(png);
  expect(asked).toEqual([["clip.mp4", { width: 512, height: 512 }]]);
  expect(
    await createVideoPoster("clip.mp4", {
      decoderPath: null,
      nativeImage: thumbnailer({ isEmpty: () => true, toPNG: () => png }),
    }),
  ).toBeNull();
  expect(await createVideoPoster("clip.mp4", { nativeImage: {}, decoderPath: null })).toBeNull();
});
