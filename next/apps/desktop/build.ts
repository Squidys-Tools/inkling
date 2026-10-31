import { rm } from "node:fs/promises";

// Every runtime dependency stays external: electron-builder ships them from
// node_modules, and native ones (sharp, onnxruntime, canvas) cannot be bundled.
// Workspace packages are bundled into each entry.
const { dependencies } = (await Bun.file("package.json").json()) as {
  dependencies: Record<string, string>;
};
const external = ["electron", ...Object.keys(dependencies).flatMap((name) => [name, `${name}/*`])];
const outdir = "dist/desktop";
await rm(outdir, { recursive: true, force: true });

const results = await Promise.all([
  ...Object.entries({
    main: "apps/desktop/src/main.ts",
    library: "packages/library/src/process.ts",
    worker: "packages/jobs/src/process.ts",
  }).map(([name, entry]) =>
    Bun.build({
      entrypoints: [entry],
      outdir,
      target: "node",
      format: "esm",
      // Lazy imports (PDF, thumbnails, URL extraction) become chunks loaded on first use.
      splitting: true,
      naming: { entry: `${name}.mjs`, chunk: `${name}-[hash].mjs` },
      external,
    }),
  ),
  // The library process starts this beside its own bundle for export snapshots.
  Bun.build({
    entrypoints: ["packages/library/src/storage/sqlite-snapshot-worker.ts"],
    outdir,
    target: "node",
    format: "esm",
    naming: "[name].mjs",
    external,
  }),
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
