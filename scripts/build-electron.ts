import { rm } from "node:fs/promises";

// Dependencies stay external: electron-builder ships them, and native modules
// (sharp, onnxruntime, canvas) cannot be bundled. Workspace packages and our
// own sources are bundled, so the preload carries its command list inline.
const packageJson = (await Bun.file("package.json").json()) as {
  dependencies: Record<string, string>;
};
const external = [
  "electron",
  ...Object.keys(packageJson.dependencies).flatMap((name) =>
    name.startsWith("@inkling/") ? [] : [name, `${name}/*`],
  ),
];
const outdir = "dist/electron";

await rm(outdir, { recursive: true, force: true });

const builds = [
  Bun.build({
    entrypoints: [
      "electron/main.ts",
      "electron/sqlite-snapshot-worker.ts",
      "electron/updater.ts",
      "electron/thumbnail.ts",
      "electron/video-poster.ts",
    ],
    outdir,
    target: "node",
    format: "esm",
    // Lazy imports (URL extraction, PDF, thumbnails) become chunks loaded on first use.
    splitting: true,
    naming: { entry: "[name].mjs", chunk: "[name]-[hash].mjs" },
    external,
  }),
  // A sandboxed preload must be one CommonJS file that requires only electron.
  Bun.build({
    entrypoints: ["electron/preload.ts"],
    outdir,
    target: "node",
    format: "cjs",
    naming: "[name].cjs",
    external: ["electron"],
  }),
];

for (const result of await Promise.all(builds)) {
  if (!result.success) {
    for (const message of result.logs) console.error(message);
    process.exit(1);
  }
}
