import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Makes thumbnails of the demo seed's photos and a poster of its clip, and checks
// the poster's refusals. Pass an unpacked Linux app directory to run the packaged
// worker's modules on its Electron runtime; with no argument it runs the source.
const root = resolve(import.meta.dirname, "../..");
const packaged = process.argv[2] && resolve(process.argv[2]);
if (packaged && !process.versions.electron) {
  const child = spawnSync(join(packaged, "inkling"), [fileURLToPath(import.meta.url), packaged], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `packaged media smoke ${child.signal}`);
} else {
  const require = createRequire(
    packaged ? join(packaged, "resources/app.asar/package.json") : join(root, "package.json"),
  );
  const sharp: typeof import("sharp").default = require("sharp");
  const seed = join(root, "apps/renderer/src/library/preview/seed-demo");
  const bundle = packaged && join(packaged, "resources/app.asar/dist/desktop");
  const thumbnailModule = bundle
    ? join(
        bundle,
        readdirSync(bundle).find((name) => /^worker-thumbnail-.*\.mjs$/.test(name))!,
      )
    : join(root, "packages/jobs/src/thumbnail.ts");
  const { createImageThumbnail }: typeof import("../../packages/jobs/src/thumbnail.ts") =
    await import(pathToFileURL(thumbnailModule).href);
  const { createVideoPoster }: typeof import("../../packages/jobs/src/video-poster.ts") =
    await import(
      pathToFileURL(
        bundle ? join(bundle, "video-poster.mjs") : join(root, "packages/jobs/src/video-poster.ts"),
      ).href
    );
  const decoderOptions = { decoderPath: process.env.INKLING_TEST_FFMPEG };
  const scratch = await mkdtemp(join(tmpdir(), "inkling-media-smoke-"));
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  // The reference runs on the same sharp, so a wrong size or a lost EXIF rotation fails.
  const assertThumbnail = async (source: Buffer) => {
    const [info, { info: reference }] = await Promise.all([
      createImageThumbnail(source).then(({ bytes }) => sharp(bytes).metadata()),
      sharp(source)
        .rotate()
        .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .toBuffer({ resolveWithObject: true }),
    ]);
    assert.equal(info.format, "webp");
    assert.deepEqual([info.width, info.height], [reference.width, reference.height]);
    return info;
  };
  try {
    for (const name of [
      "compressO-IMG_2618.jpg",
      "compressO-IMG_3865.jpg",
      "compressO-IMG_3921.jpg",
      "compressO-IMG_4630.jpg",
      "compressO-IMG_4631.jpg",
    ]) {
      const bytes = await readFile(join(seed, name));
      const original = hash(bytes);
      await assertThumbnail(bytes);
      assert.equal(hash(bytes), original);
    }
    const pixels = Buffer.alloc(1024 * 768 * 4);
    for (let y = 0; y < 768; y++)
      for (let x = 0; x < 1024; x++) {
        const i = (y * 1024 + x) * 4;
        const line = y % 48 < 4 || x % 128 < 4;
        pixels[i] = line ? 34 : 220;
        pixels[i + 1] = line ? 85 : 225;
        pixels[i + 2] = line ? 119 : 230;
        pixels[i + 3] = x < 100 ? 0 : 255;
      }
    const grid = await sharp(pixels, { raw: { width: 1024, height: 768, channels: 4 } })
      .png()
      .toBuffer();
    assert((await assertThumbnail(grid)).hasAlpha);
    console.log(
      "PASS image thumbnails are upright WebP within 512 px, keep alpha and leave originals",
    );

    const clip = join(seed, "saved-clip.mp4");
    const original = hash(await readFile(clip));
    const poster = await createVideoPoster(clip, decoderOptions);
    assert(poster, "real system decoder produces a frame");
    await assertThumbnail(poster);
    const bad = join(scratch, "not-a-video.mp4");
    await writeFile(bad, "not a video");
    assert.equal(await createVideoPoster(bad, decoderOptions), null);
    assert.equal(
      await createVideoPoster(clip, { decoderPath: join(scratch, "missing-ffmpeg") }),
      null,
    );
    await assert.rejects(() => createVideoPoster("https://example.com/video.mp4", decoderOptions));
    const playlist = join(scratch, "network.m3u8");
    await writeFile(
      playlist,
      "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:1/never-fetch.ts\n#EXT-X-ENDLIST\n",
    );
    assert.equal(await createVideoPoster(playlist, decoderOptions), null);
    assert.equal(hash(await readFile(clip)), original);
    console.log(
      "PASS video poster from the system decoder; unsupported files, a missing decoder, URLs and remote playlists refused",
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
