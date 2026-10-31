import path from "node:path";

export function pdfResourcePaths(directory: string, paths: Pick<typeof path, "join"> = path) {
  // PDF.js checks for a literal forward slash, even in its Node filesystem factories.
  // Windows accepts this trailing slash after a native path; path.sep would be rejected.
  const resource = (name: string) => `${paths.join(directory, name)}/`;
  return {
    standardFontDataUrl: resource("standard_fonts"),
    cMapUrl: resource("cmaps"),
    wasmUrl: resource("wasm"),
  };
}
