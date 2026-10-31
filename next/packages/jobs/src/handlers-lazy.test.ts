import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fixturePath } from "./test-fixtures.ts";

test("the system-font scan waits for PDF jobs, including after BMP thumbnailing", () => {
  const handlersUrl = pathToFileURL(join(import.meta.dir, "handlers.ts")).href;
  const thumbnailUrl = pathToFileURL(join(import.meta.dir, "thumbnail.ts")).href;
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
      '  if (url.endsWith("/jobs/src/pdf.ts") || url.endsWith("/@napi-rs/canvas/index.js")) {',
      '    await appendFile(loadLogPath, url + "\\n");',
      "  }",
      "  return nextLoad(url, context);",
      "}",
    ].join("\n"),
  );
  const probe = [
    'import { readFileSync } from "node:fs";',
    'const { Effect } = await import("effect");',
    `const { makeWorkerHandlers } = await import(${JSON.stringify(handlersUrl)});`,
    'const loadedModules = () => readFileSync(process.env.INKLING_MODULE_LOAD_LOG, "utf8").trim().split("\\n").filter(Boolean);',
    "const countLoaded = (part) => loadedModules().filter((url) => url.includes(part)).length;",
    'const pdfUrl = "/jobs/src/pdf.ts";',
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
    "const thumbnail = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {",
    "  const handlers = yield* makeWorkerHandlers({ modelCacheDirectory: process.env.INKLING_MODEL_CACHE_DIRECTORY });",
    '  if (countLoaded(pdfUrl) || countLoaded(canvasEntryUrl)) throw new Error("Handler construction loaded PDF dependencies");',
    `  return yield* handlers.pdfThumbnail({ path: ${JSON.stringify(fixturePath("pdf-native-text-01.pdf"))} });`,
    "})));",
    "const pdfModuleLoads = countLoaded(pdfUrl);",
    "const canvasEntryLoads = countLoaded(canvasEntryUrl);",
    'if (pdfModuleLoads !== 1 || canvasEntryLoads !== 1 || !thumbnail.bytes.length) throw new Error("PDF job did not load and use its dependencies once");',
    "console.log(JSON.stringify({ pdfModuleLoads, canvasEntryLoads }));",
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
        cwd: import.meta.dir,
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
    expect(JSON.parse(result.stdout)).toMatchObject({ pdfModuleLoads: 1, canvasEntryLoads: 1 });
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
