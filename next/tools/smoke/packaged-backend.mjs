import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Runs the packaged app's own PDF chunk, OCR worker, sharp and ONNX models on its
// Electron Node runtime, with no window and no library. Default: the build:dir output.
const root = resolve(import.meta.dirname, "../..");
const mac = process.platform === "darwin";
const windows = process.platform === "win32";
const appDirectory = resolve(
  process.argv[2] ??
    join(
      root,
      ".artifacts/electron",
      mac ? "mac-arm64" : windows ? "win-unpacked" : "linux-unpacked",
    ),
);
const contents = mac ? join(appDirectory, "inkling.app/Contents") : appDirectory;
const resources = join(contents, mac ? "Resources" : "resources");

if (!process.versions.electron) {
  const result = spawnSync(
    join(contents, mac ? "MacOS/inkling" : windows ? "inkling.exe" : "inkling"),
    [fileURLToPath(import.meta.url), appDirectory],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `packaged backend exited ${result.status}, signal ${result.signal}`,
  );
} else {
  // Node-only native/module checks: no renderer, user library or sandbox override.
  const archive = join(resources, "app.asar");
  const unpacked = join(resources, "app.asar.unpacked");
  const require = createRequire(join(archive, "package.json"));
  const scratch = await mkdtemp(join(tmpdir(), "inkling-backend-smoke-"));
  const originalFontScan = process.env.DISABLE_SYSTEM_FONTS_LOAD;
  let worker;
  let inference;
  try {
    const chunks = join(archive, "dist/desktop");
    const pdfChunk = (await readdir(chunks)).find((name) => /^worker-pdf-.*\.mjs$/.test(name));
    assert(pdfChunk, "the worker's packaged PDF chunk is present");
    const pdf = await import(pathToFileURL(join(chunks, pdfChunk)).href);
    const fixtures = join(root, "packages/jobs/src/fixtures");
    const native = await pdf.extractPdfTextByPages(
      await readFile(join(fixtures, "pdf-native-text-01.pdf")),
    );
    assert.match(native.text.toLowerCase(), /local first/);
    const thumbnail = await pdf.renderPdfFirstPage(
      await readFile(join(fixtures, "pdf-native-text-01.pdf")),
    );
    assert.equal(thumbnail.subarray(1, 4).toString(), "PNG");
    assert.equal(
      process.env.DISABLE_SYSTEM_FONTS_LOAD,
      originalFontScan,
      "font-scan setting does not leak",
    );
    console.log("PASS packaged PDF worker, fonts and raster thumbnail");

    const { createWorker } = require("tesseract.js");
    const tesseractDirectory = dirname(require.resolve("tesseract.js").replace(archive, unpacked));
    const languageDirectory = dirname(
      require.resolve("@tesseract.js-data/eng").replace(archive, unpacked),
    );
    worker = await createWorker("eng", 1, {
      cachePath: scratch,
      langPath: join(languageDirectory, "4.0.0_best_int"),
      workerPath: join(tesseractDirectory, "worker-script/node/index.js"),
      gzip: true,
    });
    const image = await worker.recognize(await readFile(join(fixtures, "image-columns-01.png")));
    assert.match(image.data.text.toLowerCase(), /field notes/);
    const scanned = await pdf.extractPdfTextByPages(
      await readFile(join(fixtures, "pdf-scanned-01.pdf")),
      {
        recognize: async (bytes) => (await worker.recognize(bytes)).data.text,
      },
    );
    assert.equal(scanned.ocrPages, 1);
    assert.match(scanned.text.toLowerCase(), /memorandum/);
    console.log("PASS packaged English OCR worker and scanned PDF OCR");

    const sharp = require("sharp");
    const sharpEsm = (
      await import(pathToFileURL(require.resolve("sharp").replace(/index\.cjs$/, "index.mjs")).href)
    ).default;
    for (const backend of [sharp, sharpEsm]) {
      assert.equal(
        Boolean(backend.versions.emscripten),
        process.platform === "linux",
        "only Linux Electron selects the WASM backend",
      );
      const webp = await backend(thumbnail).resize(128, 128).webp().toBuffer();
      assert.equal((await backend(webp).metadata()).width, 128);
    }
    console.log("PASS packaged sharp CJS/ESM resize and WebP decode");

    const ort = require("onnxruntime-node");
    const manifest = JSON.parse(
      await readFile(join(root, "packages/jobs/src/model-manifest.json"), "utf8"),
    );
    const modelRoot = join(resources, "models");
    const { Tokenizer } = await import(
      pathToFileURL(require.resolve("@huggingface/tokenizers").replace(/\.cjs$/, ".mjs")).href
    );
    const tokenizer = new Tokenizer(
      JSON.parse(
        await readFile(join(modelRoot, manifest.text.name, manifest.text.tokenizer.path), "utf8"),
      ),
      {},
    );
    const tokens = tokenizer.encode("search_document: Libraries keep books and field notes.", {
      return_token_type_ids: true,
    });
    const tensor = (values) =>
      new ort.Tensor("int64", BigInt64Array.from(values, BigInt), [1, values.length]);
    inference = await ort.InferenceSession.create(
      join(modelRoot, manifest.text.name, manifest.text.model.path),
      { intraOpNumThreads: 2 },
    );
    const text = await inference.run({
      input_ids: tensor(tokens.ids),
      attention_mask: tensor(tokens.ids.map(() => 1)),
      token_type_ids: tensor(tokens.token_type_ids ?? tokens.ids.map(() => 0)),
    });
    assert.deepEqual(text.last_hidden_state.dims, [1, tokens.ids.length, 768]);
    assert(text.last_hidden_state.data.every(Number.isFinite));
    await inference.release();
    inference = undefined;
    console.log("PASS packaged pinned text model CPU inference");

    const pixels = await sharp(thumbnail)
      .resize(224, 224, { fit: "cover" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer();
    const normalized = new Float32Array(3 * 224 * 224);
    const mean = [0.4814547, 0.4578275, 0.4082107];
    const std = [0.26862954, 0.2613026, 0.2757771];
    for (let i = 0; i < 224 * 224; i++) {
      for (let c = 0; c < 3; c++)
        normalized[c * 224 * 224 + i] = (pixels[i * 3 + c] / 255 - mean[c]) / std[c];
    }
    inference = await ort.InferenceSession.create(
      join(modelRoot, manifest.image.name, manifest.image.model.path),
      { intraOpNumThreads: 2 },
    );
    const vision = await inference.run({
      pixel_values: new ort.Tensor("float32", normalized, [1, 3, 224, 224]),
    });
    assert.equal(vision.last_hidden_state.dims[2], 768);
    assert(vision.last_hidden_state.data.every(Number.isFinite));
    console.log("PASS packaged pinned vision model CPU inference");
  } finally {
    await inference?.release();
    await worker?.terminate();
    await rm(scratch, { recursive: true, force: true });
  }
}
