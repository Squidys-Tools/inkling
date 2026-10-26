#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { loadManifest, corpusPath, benchmarksRoot } from "./manifest";
import { startCorpusServer } from "./server";
import { extractFixture } from "./extract";
import { extractPdf } from "./pdf";
import { extractPdfTextByPages } from "../../electron/pdf.ts";
import { availableOcrEngines, WindowsOcrEngine, TesseractJsEngine, type OcrEngine } from "./ocr";
import { average, bannedTermHits, stringScore, termMatches, tokenStats, tokenize } from "./score";
import type { ManifestItem, ExpectedSearch } from "./manifest";
import type { ExtractionOutcome } from "./extract";

type Status = "pass" | "partial" | "fail" | "skip";

interface ItemResult {
  id: string;
  type: string;
  engine: string;
  status: Status;
  score: number;
  metrics: Record<string, unknown>;
  messages: string[];
}

const EXTRACTION_TYPES = new Set(["article", "recipe", "video"]);

function statusFor(score: number): Status {
  if (score === 1) return "pass";
  if (score >= 0.6) return "partial";
  return "fail";
}

function skipResult(item: ManifestItem, reason: string): ItemResult {
  return {
    id: item.id,
    type: item.type,
    engine: "none",
    status: "skip",
    score: 0,
    metrics: { reason },
    messages: [reason],
  };
}

function scoreExtraction(item: ManifestItem, outcome: ExtractionOutcome): ItemResult {
  const exp = item.expected ?? {};
  const messages: string[] = [];

  if (!outcome.ok) {
    return {
      id: item.id,
      type: item.type,
      engine: outcome.engine,
      status: "fail",
      score: 0,
      metrics: { errorCode: outcome.errorCode, errorDetail: outcome.errorDetail },
      messages: [`ingestion failed (${outcome.errorCode}): ${outcome.errorDetail}`],
    };
  }

  const parts: number[] = [];
  const searchable = `${outcome.title ?? ""} ${outcome.description ?? ""} ${outcome.text ?? ""}`;
  if (exp.title) {
    const value = stringScore(exp.title, outcome.title ?? "");
    parts.push(value);
    if (value < 1) messages.push(`title mismatch: expected "${exp.title}", got "${outcome.title}"`);
  }
  if (exp.author) {
    const value = stringScore(exp.author, outcome.author ?? "");
    parts.push(value);
    if (value < 1)
      messages.push(`author mismatch: expected "${exp.author}", got "${outcome.author}"`);
  }
  if (exp.search_terms?.length) {
    const matches = termMatches(searchable, exp.search_terms);
    parts.push(matches.filter((m) => m.found).length / matches.length);
    for (const m of matches.filter((m) => !m.found))
      messages.push(`search term not found: "${m.term}"`);
  }
  const banned = bannedTermHits(searchable, exp.must_not_match ?? []);
  for (const term of banned) messages.push(`banned term found in extracted text: "${term}"`);
  if (banned.length) parts.push(0);

  if (exp.image_urls_min != null) {
    const value = Math.min(1, outcome.imageUrls.length / exp.image_urls_min);
    parts.push(value);
    if (value < 1)
      messages.push(`expected >= ${exp.image_urls_min} images, got ${outcome.imageUrls.length}`);
  }
  if (exp.safe_embeds?.length) {
    for (const req of exp.safe_embeds) {
      const count = outcome.safeEmbeds.filter((e) => e.provider === req.provider).length;
      const min = req.min ?? 1;
      const value = Math.min(1, count / min);
      parts.push(value);
      if (value < 1) messages.push(`expected >= ${min} "${req.provider}" embed(s), got ${count}`);
    }
  }
  if (exp.safe_embeds_max != null && outcome.safeEmbeds.length > exp.safe_embeds_max) {
    parts.push(0);
    messages.push(
      `expected <= ${exp.safe_embeds_max} embed(s), got ${outcome.safeEmbeds.length} (${outcome.safeEmbeds.map((e) => e.provider).join(", ")})`,
    );
  }

  const score = average(parts);
  return {
    id: item.id,
    type: item.type,
    engine: outcome.engine,
    status: statusFor(score),
    score,
    metrics: {
      title: outcome.title,
      author: outcome.author,
      imageUrls: outcome.imageUrls.length,
      safeEmbeds: outcome.safeEmbeds.length,
      textLength: (outcome.text ?? "").length,
      extractor: outcome.extractor,
    },
    messages,
  };
}

function scorePlainText(item: ManifestItem, text: string, engine: string): ItemResult {
  const exp = item.expected ?? {};
  const messages: string[] = [];
  const parts: number[] = [];
  if (exp.search_terms?.length) {
    const matches = termMatches(text, exp.search_terms);
    parts.push(matches.filter((m) => m.found).length / matches.length);
    for (const m of matches.filter((m) => !m.found))
      messages.push(`search term not found: "${m.term}"`);
  }
  const banned = bannedTermHits(text, exp.must_not_match ?? []);
  for (const term of banned) messages.push(`banned term found: "${term}"`);
  if (banned.length) parts.push(0);

  const score = average(parts);
  return {
    id: item.id,
    type: item.type,
    engine,
    status: statusFor(score),
    score,
    metrics: { textLength: text.length },
    messages,
  };
}

function scorePdf(
  item: ManifestItem,
  extraction: { pages: string[]; text: string; engine: string; ocrPages: number },
  embeddedImages: number,
  pdfLatencyMs: number,
  ocrLatencyMs: number,
): ItemResult {
  const exp = item.expected ?? {};
  const messages: string[] = [];
  const parts: number[] = [];
  const text = extraction.text;

  if (exp.search_terms?.length) {
    const matches = termMatches(text, exp.search_terms);
    parts.push(matches.filter((m) => m.found).length / matches.length);
    for (const m of matches.filter((m) => !m.found))
      messages.push(`search term not found: "${m.term}"`);
  }
  const banned = bannedTermHits(text, exp.must_not_match ?? []);
  for (const term of banned) messages.push(`banned term found: "${term}"`);
  if (banned.length) parts.push(0);

  if (exp.ocr_text_file) {
    const expectedText = readFileSync(corpusPath(exp.ocr_text_file), "utf8");
    const stats = tokenStats(expectedText, text);
    parts.push((stats.recall + stats.precision) / 2);
    if (stats.recall < 1) messages.push(`OCR recall ${stats.recall.toFixed(2)}`);
    if (stats.precision < 1) messages.push(`OCR precision ${stats.precision.toFixed(2)}`);
  }

  if (exp.embedded_images_min != null) {
    const value = Math.min(1, embeddedImages / exp.embedded_images_min);
    parts.push(value);
    if (value < 1)
      messages.push(
        `expected >= ${exp.embedded_images_min} embedded image(s), got ${embeddedImages}`,
      );
  }

  const score = average(parts);
  return {
    id: item.id,
    type: item.type,
    engine: extraction.engine,
    status: statusFor(score),
    score,
    metrics: {
      pageCount: extraction.pages.length,
      textLength: text.length,
      ocrPages: extraction.ocrPages,
      embeddedImages,
      pdfLatencyMs,
      ocrLatencyMs,
    },
    messages,
  };
}

function scoreOcr(
  item: ManifestItem,
  expectedText: string,
  actualText: string,
  engine: string,
  elapsedMs: number,
): ItemResult {
  const stats = tokenStats(expectedText, actualText);
  const score = (stats.recall + stats.precision) / 2;
  const messages: string[] = [];
  if (stats.recall < 1) {
    const missing = [...new Set(tokenize(expectedText))].filter(
      (t) => !tokenize(actualText).includes(t),
    );
    messages.push(`OCR recall ${stats.recall.toFixed(2)} (${stats.expectedCount} expected tokens)`);
    messages.push(`missing tokens (sample): ${missing.slice(0, 8).join(", ")}`);
  }
  if (stats.precision < 1) messages.push(`OCR precision ${stats.precision.toFixed(2)}`);
  return {
    id: item.id,
    type: item.type,
    engine,
    status: statusFor(score),
    score,
    metrics: { ...stats, elapsedMs },
    messages,
  };
}

async function tryOcr(
  engine: OcrEngine,
  filePath: string,
): Promise<{ text: string; engine: string; elapsedMs: number } | null> {
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
  const exp: ExpectedSearch = item.expected ?? {};
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
    let embeddedImages: number;
    let extraction: Awaited<ReturnType<typeof extractPdfTextByPages>>;
    try {
      embeddedImages = extractPdf(filePath).embeddedImages;
      extraction = await extractPdfTextByPages(readFileSync(filePath), {
        recognize: ocrEngines.length
          ? async (image) => {
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
            }
          : undefined,
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
    if (!extraction.text && exp.ocr_text_file && ocrEngines.length === 0) {
      return skipResult(
        item,
        "scanned PDF: no OCR engine available (Windows.Media.Ocr or tesseract.js)",
      );
    }
    return scorePdf(item, extraction, embeddedImages, pdfLatencyMs, ocrLatencyMs);
  }

  if (item.type === "image" || item.type === "screenshot") {
    if (exp.ocr_text_file) {
      const expectedText = readFileSync(corpusPath(exp.ocr_text_file), "utf8");
      let best: ItemResult | null = null;
      for (const engine of ocrEngines) {
        const result = await tryOcr(engine, filePath);
        if (!result) continue;
        const scored = scoreOcr(item, expectedText, result.text, result.engine, result.elapsedMs);
        if (!best || scored.score > best.score) best = scored;
      }
      if (!best)
        return skipResult(item, "no OCR engine available (Windows.Media.Ocr or tesseract.js)");
      return best;
    }
    return skipResult(item, "vision/similarity scoring not implemented (embeddings benchmark)");
  }

  return skipResult(item, `unknown item type "${item.type}"`);
}

interface Summary {
  total: number;
  pass: number;
  partial: number;
  fail: number;
  skip: number;
  avgScore: number;
}

function summarize(results: ItemResult[]): Summary {
  const scorable = results.filter((r) => r.status !== "skip");
  return {
    total: results.length,
    pass: results.filter((r) => r.status === "pass").length,
    partial: results.filter((r) => r.status === "partial").length,
    fail: results.filter((r) => r.status === "fail").length,
    skip: results.filter((r) => r.status === "skip").length,
    avgScore: scorable.length ? scorable.reduce((sum, r) => sum + r.score, 0) / scorable.length : 0,
  };
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function machineInfo() {
  return {
    os: `${platform()} ${release()}`,
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    cores: cpus().length,
    memoryGb: Math.round(totalmem() / 2 ** 30),
    bun: Bun.version,
  };
}

function writeSummaryMarkdown(report: {
  generatedAt: string;
  machine: ReturnType<typeof machineInfo>;
  overall: Summary;
  byType: Record<string, Summary>;
  items: ItemResult[];
}): string {
  const lines: string[] = [];
  lines.push("# Benchmark results");
  lines.push(`Generated: ${report.generatedAt}`);
  const m = report.machine;
  lines.push(
    `Machine: ${m.os} ${m.arch}, ${m.cpu}, ${m.cores} cores, ${m.memoryGb} GB RAM, Bun ${m.bun}`,
  );
  lines.push("");
  lines.push(
    `## Overall: score ${report.overall.avgScore.toFixed(3)} — pass ${report.overall.pass}, partial ${report.overall.partial}, fail ${report.overall.fail}, skip ${report.overall.skip}`,
  );
  lines.push("");
  lines.push("| Type | Score | Pass | Partial | Fail | Skip | Total |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const [type, s] of Object.entries(report.byType)) {
    lines.push(
      `| ${type} | ${s.avgScore.toFixed(3)} | ${s.pass} | ${s.partial} | ${s.fail} | ${s.skip} | ${s.total} |`,
    );
  }
  lines.push("");
  lines.push("Scores average non-skipped items only; skipped items are excluded.");
  const imageOcr = report.items
    .filter((item) => ["image", "screenshot"].includes(item.type))
    .map((item) => item.metrics.elapsedMs)
    .filter((value): value is number => typeof value === "number");
  const pdfLatency = report.items
    .map((item) => item.metrics.pdfLatencyMs)
    .filter((value): value is number => typeof value === "number");
  const pdfOcrLatency = report.items
    .map((item) => item.metrics.ocrLatencyMs)
    .filter((value): value is number => typeof value === "number" && value > 0);
  lines.push("");
  lines.push("## Latency");
  lines.push(
    `Image OCR: median ${percentile(imageOcr, 0.5).toFixed(0)} ms, p90 ${percentile(imageOcr, 0.9).toFixed(0)} ms (${imageOcr.length} items).`,
  );
  lines.push(
    `PDF processing: median ${percentile(pdfLatency, 0.5).toFixed(0)} ms, p90 ${percentile(pdfLatency, 0.9).toFixed(0)} ms (${pdfLatency.length} items).`,
  );
  if (pdfOcrLatency.length) {
    lines.push(
      `PDF OCR total per document: median ${percentile(pdfOcrLatency, 0.5).toFixed(0)} ms, p90 ${percentile(pdfOcrLatency, 0.9).toFixed(0)} ms (${pdfOcrLatency.length} PDFs).`,
    );
  }
  lines.push("");
  lines.push("## Items");
  for (const r of report.items) {
    lines.push(`- [${r.status.toUpperCase()}] ${r.id} (score ${r.score.toFixed(3)}, ${r.engine})`);
  }
  lines.push("");
  const withMessages = report.items.filter((r) => r.messages.length > 0);
  if (withMessages.length) {
    lines.push("## Details");
    for (const r of withMessages) {
      lines.push(`### ${r.id} — ${r.status} (${r.score.toFixed(3)})`);
      for (const m of r.messages) lines.push(`- ${m}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const manifest = loadManifest();
  const server = await startCorpusServer(corpusPath("."));

  console.log(`Loaded ${manifest.items.length} fixtures; corpus server at ${server.baseUrl}`);
  const ocrEngines = await availableOcrEngines([
    new WindowsOcrEngine(join(import.meta.dir, "win-ocr.ps1")),
    new TesseractJsEngine(),
  ]);
  console.log(
    `OCR engines: ${ocrEngines.length ? ocrEngines.map((e) => e.name).join(", ") : "none (screenshots/scan OCR skipped)"}`,
  );
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

  const byType: Record<string, Summary> = {};
  for (const item of manifest.items) {
    if (!byType[item.type])
      byType[item.type] = { total: 0, pass: 0, partial: 0, fail: 0, skip: 0, avgScore: 0 };
  }
  for (const r of items) {
    const s = byType[r.type];
    s.total++;
    s[r.status]++;
    if (r.status !== "skip") {
      s.avgScore = (s.avgScore * (s.total - 1 - s.skip) + r.score) / Math.max(1, s.total - s.skip);
    }
  }

  const overall = summarize(items);
  const report = {
    generatedAt: new Date().toISOString(),
    machine: machineInfo(),
    engine: { ocr: ocrEngines.map((e) => e.name) },
    overall,
    byType,
    items,
  };

  const resultsDir = join(benchmarksRoot, "results");
  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(resultsDir, "results-latest.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(resultsDir, `results-${stamp}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(resultsDir, "summary.md"), writeSummaryMarkdown(report));

  console.log("");
  console.log(
    `Overall score: ${overall.avgScore.toFixed(3)} (pass ${overall.pass}, partial ${overall.partial}, fail ${overall.fail}, skip ${overall.skip})`,
  );
  console.log(`Results written to benchmarks/results/`);
}

await main();
