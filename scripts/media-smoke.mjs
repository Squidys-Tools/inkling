import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const packaged = process.argv[2] && process.argv[2] !== "source" ? resolve(process.argv[2]) : null;
if (packaged && !process.versions.electron) {
  const child = spawnSync(
    join(packaged, "inkling"),
    [fileURLToPath(import.meta.url), packaged, process.argv[3] ?? ""],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "inherit",
    },
  );
  assert.equal(child.status, 0, `packaged media smoke ${child.signal}`);
} else {
  const require = createRequire(
    packaged ? join(packaged, "resources/app.asar/package.json") : join(root, "package.json"),
  );
  const sharp = require("sharp");
  const base = packaged
    ? join(packaged, "resources/app.asar/dist/electron")
    : join(root, "electron");
  const suffix = packaged ? "mjs" : "ts";
  const { createImageThumbnail, sharpImageInput, validateImageDimensions } = await import(
    pathToFileURL(join(base, `thumbnail.${suffix}`)).href
  );
  const { createVideoPoster } = await import(
    pathToFileURL(join(base, `video-poster.${suffix}`)).href
  );
  const decoderOptions = { nativeImage: {}, decoderPath: process.env.INKLING_TEST_FFMPEG };
  const out = process.argv[3]
    ? resolve(process.argv[3])
    : await mkdtemp(join(tmpdir(), "inkling-media-evidence-"));
  await mkdir(out, { recursive: true });
  const scratch = await mkdtemp(join(tmpdir(), "inkling-media-negative-"));
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const resize = (bytes) =>
    sharp(bytes)
      .rotate()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true });
  const previousThumbnail = async (bytes) => {
    const input = await sharpImageInput(bytes);
    const image = sharp(input);
    const metadata = await image.metadata();
    validateImageDimensions(metadata.width, metadata.height);
    return image
      .rotate()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
  };
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const psnr = async (reference, encoded) => {
    const decoded = await sharp(encoded)
      .flatten({ background: "white" })
      .removeAlpha()
      .raw()
      .toBuffer();
    assert.equal(decoded.length, reference.length);
    let error = 0;
    for (let i = 0; i < decoded.length; i++) error += (decoded[i] - reference[i]) ** 2;
    return error === 0 ? null : 10 * Math.log10(255 ** 2 / (error / decoded.length));
  };
  const report = {
    runtime: process.versions.electron
      ? `Electron ${process.versions.electron}`
      : `Bun ${process.versions.bun}`,
    images: [],
    video: {},
    limits:
      "Five warm sequential runs per image; median wall time is evidence, not a test assertion. PSNR is pixel error, not perceptual certification. Originals are never written. No GUI or live library.",
  };
  try {
    const files = [
      "compressO-IMG_2618.jpg",
      "compressO-IMG_3865.jpg",
      "compressO-IMG_3921.jpg",
      "compressO-IMG_4630.jpg",
      "compressO-IMG_4631.jpg",
    ];
    const samples = await Promise.all(
      files.map(async (name) => ({
        name,
        bytes: await readFile(join(root, "public/seed-demo", name)),
      })),
    );
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
    samples.push({
      name: "transparent-grid",
      bytes: await sharp(pixels, { raw: { width: 1024, height: 768, channels: 4 } })
        .png()
        .toBuffer(),
    });
    for (const sample of samples) {
      const originalHash = hash(sample.bytes);
      const reference = await resize(sample.bytes)
        .flatten({ background: "white" })
        .removeAlpha()
        .raw()
        .toBuffer();
      let before, after;
      const beforeMs = [],
        afterMs = [];
      await createImageThumbnail(sample.bytes);
      await previousThumbnail(sample.bytes);
      for (let i = 0; i < 5; i++) {
        let start = performance.now();
        before = await previousThumbnail(sample.bytes);
        beforeMs.push(performance.now() - start);
        start = performance.now();
        after = (await createImageThumbnail(sample.bytes)).bytes;
        afterMs.push(performance.now() - start);
      }
      const info = await sharp(after).metadata();
      assert(info.width <= 512 && info.height <= 512);
      assert.equal(info.format, "webp");
      assert.equal(hash(sample.bytes), originalHash);
      await writeFile(join(out, `${sample.name}-before.webp`), before);
      await writeFile(join(out, `${sample.name}-after.webp`), after);
      report.images.push({
        name: sample.name,
        sourceBytes: sample.bytes.length,
        sourceSha256: originalHash,
        beforeBytes: before.length,
        afterBytes: after.length,
        beforeMs: median(beforeMs),
        afterMs: median(afterMs),
        beforePSNR: await psnr(reference, before),
        afterPSNR: await psnr(reference, after),
        alphaPreserved: sample.name !== "transparent-grid" || info.hasAlpha,
      });
    }
    const clip = join(root, "public/seed-demo/saved-clip.mp4");
    const original = hash(await readFile(clip));
    const start = performance.now();
    const poster = await createVideoPoster(clip, decoderOptions);
    assert(poster, "real system decoder produces a frame");
    const compressed = (await createImageThumbnail(poster)).bytes;
    const info = await sharp(compressed).metadata();
    assert.equal(info.format, "webp");
    assert(info.width <= 512 && info.height <= 512);
    await writeFile(join(out, "video-poster.webp"), compressed);
    const decodeAndCompressionMs = performance.now() - start;
    const bad = join(scratch, "not-a-video.mp4");
    await writeFile(bad, "not a video");
    assert.equal(await createVideoPoster(bad, decoderOptions), null);
    assert.equal(
      await createVideoPoster(clip, {
        nativeImage: {},
        decoderPath: join(scratch, "missing-ffmpeg"),
      }),
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
    report.video = {
      sourceSha256: original,
      posterBytes: compressed.length,
      decodeAndCompressionMs,
      dimensions: [info.width, info.height],
      priorLinuxBehavior: "typed artwork; no local poster",
      unsupported: "rejected without changing original",
      missingDecoder: "null; typed artwork retained",
      networkPlaylist: "protocol whitelist rejects remote segments",
      originalUnchanged: true,
    };
    await writeFile(join(out, "measurements.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
