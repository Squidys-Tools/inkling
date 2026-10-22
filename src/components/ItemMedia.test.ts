import { describe, expect, test } from "bun:test";
import { fileExtensionLabel, formatDuration, formatFileSize, noteWordCount } from "./ItemMedia";

describe("formatDuration", () => {
  test("shows minutes and seconds under an hour", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3599.9)).toBe("59:59");
  });

  test("adds hours once the video passes an hour", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

describe("formatFileSize", () => {
  test("uses bytes below one kilobyte", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  test("keeps one decimal for small values and rounds larger ones", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(245 * 1024)).toBe("245 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("fileExtensionLabel", () => {
  test("returns the uppercase extension of a file name", () => {
    expect(fileExtensionLabel("brief.docx")).toBe("DOCX");
    expect(fileExtensionLabel("  archive.tar.gz ")).toBe("GZ");
  });

  test("returns an empty label when there is no extension", () => {
    expect(fileExtensionLabel("README")).toBe("");
    expect(fileExtensionLabel("notes.thisextensionistoolong")).toBe("");
  });
});

describe("noteWordCount", () => {
  test("returns 0 for missing descriptions", () => {
    expect(noteWordCount(undefined)).toBe(0);
  });

  test("returns 0 for empty or whitespace-only descriptions", () => {
    expect(noteWordCount("")).toBe(0);
    expect(noteWordCount("   ")).toBe(0);
    expect(noteWordCount("\n\t  \n")).toBe(0);
  });

  test("counts a single word", () => {
    expect(noteWordCount("hello")).toBe(1);
  });

  test("counts words separated by spaces", () => {
    expect(noteWordCount("quick thought for today")).toBe(4);
  });

  test("collapses irregular whitespace before counting", () => {
    expect(noteWordCount("  two   spaced\twords\nnewline  ")).toBe(4);
  });
});
