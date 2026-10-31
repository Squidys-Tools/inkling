import { rm } from "node:fs/promises";

// Native and heavy dependencies stay external: electron-builder ships them from
// node_modules. Workspace packages are bundled into each entry.
const external = [
  "electron",
  "effect",
  "effect/*",
  "@effect/sql-sqlite-node",
  "onnxruntime-node",
  "sharp",
  "@napi-rs/canvas",
  "tesseract.js",
];
const outdir = "dist/desktop";
await rm(outdir, { recursive: true, force: true });

const results = await Promise.all([
  ...Object.entries({
    main: "apps/desktop/src/main.ts",
    library: "packages/library/src/process.ts",
  }).map(([name, entry]) =>
    Bun.build({
      entrypoints: [entry],
      outdir,
      target: "node",
      format: "esm",
      splitting: true,
      naming: { entry: `${name}.mjs`, chunk: `${name}-[hash].mjs` },
      external,
    }),
  ),
  // A sandboxed preload must be one CommonJS file that requires only electron.
  Bun.build({
    entrypoints: ["apps/desktop/src/preload.ts"],
    outdir,
    target: "node",
    format: "cjs",
    naming: "[name].cjs",
    external: ["electron"],
  }),
]);
for (const result of results) {
  if (result.success) continue;
  for (const message of result.logs) console.error(message);
  process.exit(1);
}
