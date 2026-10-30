import { arch, cpus, platform, release, totalmem } from "node:os";
import type { ItemResult } from "./score";

function summarize(results: ItemResult[]) {
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

export function buildReport(items: ItemResult[], ocrEngines: string[]) {
  const types = [...new Set(items.map((r) => r.type))];
  return {
    generatedAt: new Date().toISOString(),
    machine: machineInfo(),
    engine: { ocr: ocrEngines },
    overall: summarize(items),
    byType: Object.fromEntries(
      types.map((type) => [type, summarize(items.filter((r) => r.type === type))]),
    ),
    items,
  };
}

export function summaryMarkdown(report: ReturnType<typeof buildReport>) {
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
