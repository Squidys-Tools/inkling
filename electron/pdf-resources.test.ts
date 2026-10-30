import { expect, test } from "bun:test";
import { posix, win32 } from "node:path";
import { pdfResourcePaths } from "./pdf-resources.ts";

for (const [name, paths, directory] of [
  ["POSIX", posix, "/opt/inkling/resources/app.asar/node_modules/pdfjs-dist"],
  ["Windows drive", win32, "D:\\a\\inkling\\inkling\\node_modules\\pdfjs-dist"],
  ["Windows spaces", win32, "C:\\Program Files\\inkling #é\\resources\\pdfjs-dist"],
  ["Windows UNC", win32, "\\\\server\\share\\inkling\\pdfjs-dist"],
] as const) {
  test(`PDF.js resource factories accept ${name} paths without changing filesystem identity`, () => {
    const options = pdfResourcePaths(directory, paths);
    for (const [key, folder] of [
      ["standardFontDataUrl", "standard_fonts"],
      ["cMapUrl", "cmaps"],
      ["wasmUrl", "wasm"],
    ] as const) {
      const resource = options[key];
      expect(resource.endsWith("/")).toBe(true);
      expect(paths.normalize(resource)).toBe(paths.normalize(paths.join(directory, folder) + "/"));
    }
    if (paths === win32)
      expect((paths.join(directory, "cmaps") + paths.sep).endsWith("/")).toBe(false);
  });
}
