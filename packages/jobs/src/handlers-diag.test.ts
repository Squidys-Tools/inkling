import { test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fixturePath } from "./test-fixtures.ts";

// Temporary: times each step of the lazy-load test's child on CI runners.
test("diag: node child costs", () => {
  const dir = mkdtempSync(join(tmpdir(), "inkling-diag-"));
  const loader = join(dir, "loader.mjs");
  writeFileSync(loader, "export async function load(url, context, next) { return next(url, context); }");
  const url = (name: string) => JSON.stringify(pathToFileURL(join(import.meta.dir, name)).href);
  const env = { ...process.env, DISABLE_SYSTEM_FONTS_LOAD: "1", INKLING_MODEL_CACHE_DIRECTORY: dir };
  const run = (label: string, code: string, withLoader = false) => {
    const started = performance.now();
    const result = spawnSync(
      "node",
      [
        "--no-warnings",
        ...(withLoader ? ["--experimental-loader", pathToFileURL(loader).href] : []),
        "--input-type=module",
        "--eval",
        code,
      ],
      { cwd: import.meta.dir, encoding: "utf8", env },
    );
    console.log(
      `DIAG ${label}: ${(performance.now() - started).toFixed(0)} ms status=${result.status} ${result.stdout.trim().replaceAll("\n", " | ")} ${result.stderr.trim().slice(0, 200).replaceAll("\n", " ")}`,
    );
  };
  const phases = `const t0 = performance.now(); const lap = (l) => console.log(l + "=" + (performance.now() - t0).toFixed(0));`;
  for (const round of [1, 2]) {
    run(`r${round} node version`, "console.log(process.version)");
    run(`r${round} empty`, "");
    run(`r${round} empty+loader`, "", true);
    run(`r${round} effect`, 'await import("effect")');
    run(`r${round} sharp`, 'await import("sharp")');
    run(`r${round} onnxruntime-node`, 'await import("onnxruntime-node")');
    run(`r${round} tesseract.js`, 'await import("tesseract.js")');
    run(`r${round} canvas js-binding`, 'await import("@napi-rs/canvas/js-binding.js")');
    run(`r${round} canvas entry (scan off)`, 'await import("@napi-rs/canvas")');
    run(`r${round} pdfjs legacy`, 'await import("pdfjs-dist/legacy/build/pdf.mjs")');
    run(`r${round} thumbnail.ts`, `await import(${url("thumbnail.ts")})`);
    run(`r${round} embeddings.ts`, `await import(${url("embeddings.ts")})`);
    run(`r${round} handlers.ts`, `await import(${url("handlers.ts")})`);
    run(`r${round} handlers.ts+loader`, `await import(${url("handlers.ts")})`, true);
    run(
      `r${round} probe phases`,
      `${phases}
      const { Effect } = await import("effect"); lap("effect");
      const { makeWorkerHandlers } = await import(${url("handlers.ts")}); lap("handlers");
      const { createImageThumbnail } = await import(${url("thumbnail.ts")}); lap("thumbnail import");
      const bmp = Buffer.alloc(54 + 16 * 16 * 3); bmp.write("BM"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(16, 18); bmp.writeInt32LE(16, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(16 * 16 * 3, 34);
      await createImageThumbnail(bmp); lap("bmp thumbnail");
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const handlers = yield* makeWorkerHandlers({ modelCacheDirectory: process.env.INKLING_MODEL_CACHE_DIRECTORY });
        lap("handlers built");
        yield* handlers.pdfThumbnail({ path: ${JSON.stringify(fixturePath("pdf-native-text-01.pdf"))} });
        lap("pdf thumbnail");
      })));
      lap("scope closed");
      setTimeout(() => console.log("still alive after 3s"), 3000).unref();`,
      true,
    );
  }
}, 120_000);
