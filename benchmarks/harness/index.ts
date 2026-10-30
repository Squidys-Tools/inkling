#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, corpusPath, benchmarksRoot } from "./manifest";
import { startCorpusServer } from "./server";
import { extractFixture } from "./extract";
import { extractPdfTextByPages } from "../../electron/pdf.ts";
import { TesseractJsEngine, WindowsOcrEngine, type OcrEngine } from "./ocr";
import {
  scoreExtraction,
  scoreOcr,
  scorePdf,
  scorePlainText,
  skipResult,
  type ItemResult,
} from "./score";
import type { ManifestItem } from "./manifest";
import { buildReport, summaryMarkdown } from "./report";

const EXTRACTION_TYPES = new Set(["article", "recipe", "video"]);

async function tryOcr(engine: OcrEngine, filePath: string) {
  const startedAt = performance.now();
  try {
    const text = await engine.run(filePath);
    return { text, engine: engine.name, elapsedMs: performance.now() - startedAt };
  } catch (cause) {
    console.warn(
      `  [ocr] ${engine.name} failed for ${filePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    return null;
  }
}

async function runItem(
  item: ManifestItem,
  baseUrl: string,
  ocrEngines: OcrEngine[],
): Promise<ItemResult> {
  const filePath = corpusPath(item.path);

  if (EXTRACTION_TYPES.has(item.type)) {
    const outcome = await extractFixture(baseUrl, item.path);
    return scoreExtraction(item, outcome);
  }

  if (item.type === "note" || item.type === "quote") {
    const text = readFileSync(filePath, "utf8");
    return scorePlainText(item, text, "raw-file");
  }

  if (item.type === "pdf") {
    let ocrLatencyMs = 0;
    const startedAt = performance.now();
    const bytes = readFileSync(filePath);
    const embeddedImages = bytes.toString("latin1").match(/\/Subtype\s*\/Image\b/g)?.length ?? 0;
    let extraction: Awaited<ReturnType<typeof extractPdfTextByPages>>;
    try {
      extraction = await extractPdfTextByPages(bytes, {
        recognize: async (image) => {
          const failures: string[] = [];
          for (const engine of ocrEngines) {
            const ocrStartedAt = performance.now();
            try {
              const text = await engine.run(image);
              if (text.trim()) return text;
            } catch (error) {
              failures.push(
                `${engine.name}: ${error instanceof Error ? error.message : String(error)}`,
              );
            } finally {
              ocrLatencyMs += performance.now() - ocrStartedAt;
            }
          }
          if (failures.length) throw new Error(failures.join("; "));
          return "";
        },
        ocrEngineName: ocrEngines.map((engine) => engine.name).join("+"),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        id: item.id,
        type: item.type,
        engine: "pdf.js+ocr",
        status: "fail",
        score: 0,
        metrics: { error: detail },
        messages: [`PDF processing failed: ${detail}`],
      };
    }
    const pdfLatencyMs = performance.now() - startedAt;
    return scorePdf(item, extraction, embeddedImages, pdfLatencyMs, ocrLatencyMs);
  }

  if (item.type === "image" || item.type === "screenshot") {
    const ocrTextFile = item.expected?.ocr_text_file;
    if (ocrTextFile) {
      const expectedText = readFileSync(corpusPath(ocrTextFile), "utf8");
      let best: ItemResult | null = null;
      for (const engine of ocrEngines) {
        const result = await tryOcr(engine, filePath);
        if (!result) continue;
        const scored = scoreOcr(item, expectedText, result.text, result.engine, result.elapsedMs);
        if (!best || scored.score > best.score) best = scored;
      }
      return best ?? skipResult(item, "every OCR engine failed");
    }
    return skipResult(item, "vision/similarity scoring not implemented (embeddings benchmark)");
  }

  return skipResult(item, `unknown item type "${item.type}"`);
}

async function main() {
  const manifest = loadManifest();
  const server = startCorpusServer(corpusPath("."));

  console.log(`Loaded ${manifest.items.length} fixtures; corpus server at ${server.baseUrl}`);
  const ocrEngines: OcrEngine[] = [new TesseractJsEngine()];
  if (WindowsOcrEngine.available())
    ocrEngines.unshift(new WindowsOcrEngine(join(import.meta.dir, "win-ocr.ps1")));
  console.log(`OCR engines: ${ocrEngines.map((e) => e.name).join(", ")}`);
  console.log("");

  const items: ItemResult[] = [];
  try {
    for (const item of manifest.items) {
      process.stdout.write(`  ${item.id} ... `);
      const result = await runItem(item, server.baseUrl, ocrEngines);
      items.push(result);
      console.log(
        `[${result.status}] score ${result.score.toFixed(3)} ${result.messages.length ? `(${result.messages[0]})` : ""}`,
      );
    }
  } finally {
    server.stop();
    await Promise.all(ocrEngines.map((engine) => engine.close?.()));
  }

  const report = buildReport(
    items,
    ocrEngines.map((e) => e.name),
  );
  const { overall } = report;

  const resultsDir = join(benchmarksRoot, "results");
  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(resultsDir, "results-latest.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(resultsDir, `results-${stamp}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(resultsDir, "summary.md"), summaryMarkdown(report));

  console.log("");
  console.log(
    `Overall score: ${overall.avgScore.toFixed(3)} (pass ${overall.pass}, partial ${overall.partial}, fail ${overall.fail}, skip ${overall.skip})`,
  );
  console.log(`Results written to benchmarks/results/`);
}

await main();
