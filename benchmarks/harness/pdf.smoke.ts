import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPdf } from "./pdf";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("PDF smoke assertion failed: " + message);
}

const directory = mkdtempSync(join(tmpdir(), "inkling-pdf-smoke-"));
try {
  const filePath = join(directory, "regex.pdf");
  const malformedArray = "[" + "()".repeat(2_000) + "x";
  writeFileSync(
    filePath,
    "%PDF-1.4\nstream\n[(Hello) 120 (world)] TJ\n" + malformedArray + "\nendstream\nendobj\n",
    "latin1",
  );

  const result = extractPdf(filePath);
  assert(result.text === "Hello world", "TJ arrays still extract literal strings");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("PDF smoke checks passed.");
