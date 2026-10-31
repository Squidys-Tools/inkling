import { expect, test } from "bun:test";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { ShellThumbnail } from "@inkling/jobs/video-poster";
import { VIDEO_POSTER_JOB } from "../storage/library.ts";
import type { TestLibrary } from "../storage/test-library.ts";
import { cleanUpJobTests, createJobs, temporaryLibrary } from "./test-jobs.ts";

cleanUpJobTests();

const frame = await sharp({
  create: { width: 640, height: 360, channels: 3, background: "#335577" },
})
  .png()
  .toBuffer();

// Stands in for the system thumbnailer main reaches; `answer` decides what it returns.
function stubShell(answer: () => Promise<Uint8Array | null>) {
  const requested: { path: string; edge: number }[] = [];
  const shell: ShellThumbnail = async (path, edge) => {
    requested.push({ path, edge });
    return answer();
  };
  return { requested, shell };
}

async function setup(shell: ShellThumbnail | undefined) {
  const events: string[] = [];
  const { root, library } = await temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
  });
  const jobs = await createJobs(root, { shell, videoDecoderPath: null });
  // Only the poster kind is claimed, so a drain never waits on model jobs.
  const worker = await library.worker({
    processors: { [VIDEO_POSTER_JOB]: jobs.thumbnailProcessors[VIDEO_POSTER_JOB] },
    onIdle: jobs.onIdle,
  });
  return { root, events, library, worker, jobs };
}

const saveVideo = (library: TestLibrary, fileName: string) =>
  library.saveFile({
    fileName,
    mimeType: "video/mp4",
    kind: "video",
    bytes: Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112]),
  });

const posterJobs = (library: TestLibrary) =>
  library.db
    .prepare("SELECT item_id, status, retry_count FROM jobs WHERE kind = ?")
    .all(VIDEO_POSTER_JOB);

test("a captured video gets its poster from a background job, not from capture", async () => {
  const stub = stubShell(async () => frame);
  const { root, events, library, worker } = await setup(stub.shell);

  const video = await saveVideo(library, "clip.mp4");
  expect(stub.requested).toEqual([]);
  expect((await library.getItem(video.id))?.thumbnailPath).toBeNull();
  expect(posterJobs(library)).toEqual([{ item_id: video.id, status: "pending", retry_count: 0 }]);
  events.length = 0;

  await worker.drain();

  const posterPath = `assets/items/${video.id}/thumbnail.webp`;
  expect((await library.getItem(video.id))?.thumbnailPath).toBe(posterPath);
  expect(stub.requested).toHaveLength(1);
  expect(realpathSync.native(stub.requested[0].path)).toBe(
    realpathSync.native(join(root, "assets", "items", video.id, "clip.mp4")),
  );
  expect(stub.requested[0].edge).toBe(512);
  // Read as bytes: sharp keeps a path-based input open, which blocks cleanup on Windows.
  expect(await sharp(readFileSync(join(root, posterPath))).metadata()).toMatchObject({
    format: "webp",
    width: 512,
  });
  expect(events).toEqual([video.id]);
  expect(posterJobs(library)).toEqual([{ item_id: video.id, status: "completed", retry_count: 0 }]);
});

const failures = [
  ["the shell returns an empty image", () => stubShell(async () => null), 4],
  [
    "the shell cannot read the file",
    () =>
      stubShell(async () => {
        throw new Error("no thumbnail handler");
      }),
    4,
  ],
  ["the platform has no shell thumbnailer", () => ({ requested: [], shell: undefined }), 0],
] as const;

for (const [name, makeShell, attempts] of failures) {
  test(`a video keeps its item and stops retrying when ${name}`, async () => {
    const stub = makeShell();
    const { root, events, library, worker, jobs } = await setup(stub.shell);
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
    expect(stub.requested).toHaveLength(attempts);

    events.length = 0;
    await worker.drain();
    await library.run(jobs.onIdle());
    await worker.drain();
    expect(stub.requested).toHaveLength(attempts);
    expect(posterJobs(library)).toEqual([{ item_id: video.id, status: "failed", retry_count: 3 }]);
    expect(events).toEqual([]);
  });
}

test("backfill posters only local videos that have none and have not already failed", async () => {
  const stub = stubShell(async () => frame);
  const { root, library, worker } = await setup(stub.shell);

  const legacy = await saveVideo(library, "legacy.mp4");
  const posted = await saveVideo(library, "posted.mp4");
  const broken = await saveVideo(library, "broken.mp4");
  const notes = await library.saveFile({
    fileName: "notes.txt",
    mimeType: "text/plain",
    kind: "file",
    bytes: Uint8Array.from([104, 105]),
  });
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

  expect(stub.requested.map((request) => realpathSync.native(request.path))).toEqual([
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
  expect(stub.requested).toHaveLength(1);
});
