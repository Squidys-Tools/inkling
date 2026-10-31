import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createTesseractOcr } from "../../packages/jobs/src/ocr.ts";

export interface OcrEngine {
  name: string;
  run(imagePath: string | Uint8Array): Promise<string>;
  close?(): Promise<void>;
}

/**
 * Native Windows OCR (Windows.Media.Ocr) invoked through Windows PowerShell
 * 5.1, which is the only host that can project WinRT types. Zero-install on
 * any Windows machine with the OCR language pack.
 */
export class WindowsOcrEngine implements OcrEngine {
  name = "windows-ocr";

  constructor(private readonly scriptPath: string) {}

  static available() {
    if (process.platform !== "win32") return false;
    const result = Bun.spawnSync([
      "powershell.exe",
      "-NoProfile",
      "-Command",
      "& { $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]; exit 0 }",
    ]);
    return result.exitCode === 0;
  }

  async run(imagePath: string | Uint8Array) {
    let temporaryDirectory: string | null = null;
    try {
      let sourcePath: string;
      if (typeof imagePath === "string") {
        sourcePath = imagePath;
      } else {
        temporaryDirectory = mkdtempSync(join(tmpdir(), "inkling-windows-ocr-"));
        sourcePath = join(temporaryDirectory, "page.png");
        writeFileSync(sourcePath, imagePath);
      }
      const result = Bun.spawnSync(
        [
          "powershell.exe",
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          this.scriptPath,
          "-ImagePath",
          sourcePath,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      if (result.exitCode !== 0) {
        throw new Error(
          `Windows OCR failed (exit ${result.exitCode}): ${result.stderr.toString("utf8")}`,
        );
      }
      return result.stdout.toString("utf8").trim();
    } finally {
      if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

/** OCR engine backed by the bundled Tesseract.js runtime and English model. */
export class TesseractJsEngine implements OcrEngine {
  name = "tesseract.js";
  private readonly engine = createTesseractOcr({
    cacheDirectory: join(tmpdir(), "inkling-benchmark-tesseract"),
  });

  async run(imagePath: string | Uint8Array) {
    return this.engine.recognize(
      typeof imagePath === "string" ? await readFile(imagePath) : Buffer.from(imagePath),
    );
  }

  close() {
    return this.engine.close();
  }
}
