import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("the system-font scan waits for PDF jobs, including after BMP thumbnailing", () => {
  const root = process.cwd();
  const aiJobsUrl = pathToFileURL(resolve(root, "electron/ai-jobs.ts")).href;
  const libraryUrl = pathToFileURL(resolve(root, "electron/storage/library.ts")).href;
  const thumbnailUrl = pathToFileURL(resolve(root, "electron/thumbnail.ts")).href;
  const pdfPath = resolve(root, "benchmarks/corpus/pdfs/pdf-native-text-01.pdf");
  const tempDirectory = mkdtempSync(join(tmpdir(), "inkling-lazy-imports-"));
  const loadLogPath = join(tempDirectory, "module-loads.log");
  const loaderPath = join(tempDirectory, "loader.mjs");
  writeFileSync(loadLogPath, "");
  writeFileSync(
    loaderPath,
    [
      'import { appendFile } from "node:fs/promises";',
      "const loadLogPath = process.env.INKLING_MODULE_LOAD_LOG;",
      "export async function load(url, context, nextLoad) {",
      '  if (url.endsWith("/electron/pdf.ts") || url.endsWith("/@napi-rs/canvas/index.js")) {',
      '    await appendFile(loadLogPath, url + "\\n");',
      "  }",
      "  return nextLoad(url, context);",
      "}",
    ].join("\n"),
  );
  const probe = [
    'import { readFileSync } from "node:fs";',
    'const { Effect } = await import("effect");',
    `const { JobQueue, Library } = await import(${JSON.stringify(libraryUrl)});`,
    `const { createAiJobProcessors } = await import(${JSON.stringify(aiJobsUrl)});`,
    'const loadedModules = () => readFileSync(process.env.INKLING_MODULE_LOAD_LOG, "utf8").trim().split("\\n").filter(Boolean);',
    "const countLoaded = (part) => loadedModules().filter((url) => url.includes(part)).length;",
    'const pdfUrl = "/electron/pdf.ts";',
    'const canvasEntryUrl = "/@napi-rs/canvas/index.js";',
    'if (countLoaded(pdfUrl) || countLoaded(canvasEntryUrl)) throw new Error("PDF dependencies loaded before a job");',
    `const { createImageThumbnail } = await import(${JSON.stringify(thumbnailUrl)});`,
    "const bmp = Buffer.alloc(54 + 16 * 16 * 3);",
    'bmp.write("BM");',
    "bmp.writeUInt32LE(bmp.length, 2);",
    "bmp.writeUInt32LE(54, 10);",
    "bmp.writeUInt32LE(40, 14);",
    "bmp.writeInt32LE(16, 18);",
    "bmp.writeInt32LE(16, 22);",
    "bmp.writeUInt16LE(1, 26);",
    "bmp.writeUInt16LE(24, 28);",
    "bmp.writeUInt32LE(16 * 16 * 3, 34);",
    "const bmpThumbnail = await createImageThumbnail(bmp);",
    'if (!bmpThumbnail.bytes.length || countLoaded(canvasEntryUrl)) throw new Error("BMP thumbnail triggered the system-font scan");',
    'const item = { id: "pdf-probe", localAssetPath: "fixture.pdf" };',
    "let thumbnailBytes = 0;",
    "const library = { getItem: () => Effect.succeed(item), resolveAssetPath: () => " +
      `Effect.succeed(${JSON.stringify(pdfPath)}), storePdfThumbnail: (_id, bytes) => Effect.sync(() => { thumbnailBytes = bytes.length; }) };`,
    "const ai = createAiJobProcessors({ modelCacheDirectory: process.env.INKLING_MODEL_CACHE_DIRECTORY });",
    'if (countLoaded(pdfUrl) || countLoaded(canvasEntryUrl)) throw new Error("Factory construction loaded PDF dependencies");',
    'await Effect.runPromise(ai.processors.pdf_thumbnail({ itemId: item.id }, "probe").pipe(Effect.provideService(Library, library), Effect.provideService(JobQueue, {})));',
    "const pdfModuleLoads = countLoaded(pdfUrl);",
    "const canvasEntryLoads = countLoaded(canvasEntryUrl);",
    'if (pdfModuleLoads !== 1 || canvasEntryLoads !== 1 || !thumbnailBytes) throw new Error("PDF job did not load and use its dependencies once");',
    "console.log(JSON.stringify({ pdfModuleLoads, canvasEntryLoads, bmpThumbnailBytes: bmpThumbnail.bytes.length, thumbnailBytes }));",
  ].join("\n");
  try {
    const result = spawnSync(
      "node",
      [
        "--no-warnings",
        "--experimental-loader",
        pathToFileURL(loaderPath).href,
        "--input-type=module",
        "--eval",
        probe,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          INKLING_MODULE_LOAD_LOG: loadLogPath,
          INKLING_MODEL_CACHE_DIRECTORY: tempDirectory,
        },
      },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      pdfModuleLoads: 1,
      canvasEntryLoads: 1,
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      bmpThumbnailBytes: expect.any(Number),
      thumbnailBytes: expect.any(Number),
    });
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
