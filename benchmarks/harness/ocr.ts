import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createTesseractOcr } from "../../electron/ocr.mjs";

export interface OcrEngine {
  name: string;
  available(): Promise<boolean>;
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
  private checked = false;
  private ready = false;

  constructor(private readonly scriptPath: string) {}

  async available(): Promise<boolean> {
    if (this.checked) return this.ready;
    this.checked = true;
    if (process.platform !== "win32") return false;
    try {
      const result = Bun.spawnSync([
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "& { $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]; exit 0 }",
      ]);
      this.ready = result.exitCode === 0;
    } catch {
      this.ready = false;
    }
    return this.ready;
  }

  async run(imagePath: string | Uint8Array): Promise<string> {
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

  async available(): Promise<boolean> {
    try {
      await import("tesseract.js");
      return true;
    } catch {
      return false;
    }
  }

  run(imagePath: string | Uint8Array) {
    return this.engine.recognize(imagePath);
  }

  close() {
    return this.engine.close();
  }
}

export async function availableOcrEngines(engines: OcrEngine[]): Promise<OcrEngine[]> {
  const ready: OcrEngine[] = [];
  for (const engine of engines) {
    try {
      if (await engine.available()) ready.push(engine);
    } catch {
      // engine not usable; skip it
    }
  }
  return ready;
}
