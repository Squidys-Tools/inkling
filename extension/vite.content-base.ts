import { defineConfig } from "vite";

// Shared factory for the inject-on-invoke content scripts. Each entry builds
// alone (Vite 8 lib mode allows only one iife entry per build) and emits a
// stable file name at dist/ root that background.ts references.
export function contentEntry(name: string, entry: string, globalName: string) {
  return defineConfig({
    publicDir: false,
    build: {
      outDir: "dist",
      emptyOutDir: false,
      target: "es2020",
      sourcemap: false,
      lib: {
        entry: { [name]: entry },
        formats: ["iife"],
        name: globalName,
        fileName: () => `${name}.js`,
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  });
}
