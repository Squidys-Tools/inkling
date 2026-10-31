import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVideoPoster } from "./video-poster.ts";

const root = mkdtempSync(join(tmpdir(), "inkling-video-poster-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("the poster is the shell thumbnail at card size, or nothing", async () => {
  const png = Buffer.from("png");
  const asked: unknown[] = [];
  const shell = (answer: Uint8Array | null) => async (path: string, edge: number) => {
    asked.push([path, edge]);
    return answer;
  };

  expect(await createVideoPoster("clip.mp4", { decoderPath: null, shell: shell(png) })).toEqual(
    png,
  );
  expect(asked).toEqual([["clip.mp4", 512]]);
  expect(await createVideoPoster("clip.mp4", { decoderPath: null, shell: shell(null) })).toBeNull();
  expect(
    await createVideoPoster("clip.mp4", {
      decoderPath: null,
      shell: async () => {
        throw new Error("no thumbnail handler");
      },
    }),
  ).toBeNull();
  expect(await createVideoPoster("clip.mp4", { decoderPath: null })).toBeNull();

  const oversized = join(root, "oversized.mp4");
  writeFileSync(oversized, "");
  truncateSync(oversized, 1024 * 1024 * 1024 + 1);
  expect(await createVideoPoster(oversized, { decoderPath: process.execPath })).toBeNull();
  const undecodable = join(root, "undecodable.mp4");
  writeFileSync(undecodable, "not a video");
  expect(await createVideoPoster(undecodable, { decoderPath: process.execPath })).toBeNull();
  await expect(createVideoPoster("clip.mp4", { decoderPath: process.execPath })).rejects.toThrow(
    "absolute local paths",
  );
  await expect(
    createVideoPoster(join(root, "clip.mp4"), { decoderPath: "ffmpeg" }),
  ).rejects.toThrow("absolute local paths");
});
