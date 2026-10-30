import { expect, test } from "bun:test";
import { classifyFile } from "./file-classification";

test.each([
  [{ name: "photo.pdf", type: "image/png" }, "image"],
  [{ name: "clip.bin", type: "video/mp4; codecs=h264" }, "video"],
  [{ name: "scan.png", type: "application/pdf" }, "pdf"],
  [{ name: "document.PDF", type: "" }, "pdf"],
  [{ name: "C:\\Users\\me\\holiday.HEIC", type: null }, "image"],
  [{ name: "notes.txt", type: "text/plain" }, "other"],
  [{ name: "archive", type: "" }, "other"],
] as const)("%o is classified as %s", (input, kind) => {
  expect(classifyFile(input)).toBe(kind);
});
