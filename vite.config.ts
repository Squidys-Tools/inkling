import { rmSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Vite copies public/ verbatim and offers no exclude list, so the demo seed
// folder is removed from the output after the copy. Everything else in
// public/ is still shipped.
function excludeSeedFromAppBuild() {
  return {
    name: "inkling-exclude-demo-seed",
    apply: "build" as const,
    closeBundle() {
      rmSync(new URL("./dist/seed-demo", import.meta.url), {
        recursive: true,
        force: true,
      });
    },
  };
}

// The committed demo seed (public/seed-demo/ + src/seedPersonal.ts) is the
// default for preview and UI work, and is excluded from the shipped app build.
// Both halves have to go at build time: a runtime `if` is too late, because
// Vite has already copied public/ and bundled the seed module by the time any
// gate runs.
//
// Gated on `--mode app` rather than an environment variable, because a
// `VAR=x` prefix in a package script is not cross-platform on Windows `cmd`,
// and a Tauri build runs there. `bun run build:app` is the only thing that
// passes this mode.
//
// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // `app` is the shipped Tauri build. Every other mode — dev, and the default
  // production build used by `vite preview` and the web preview deploy — keeps
  // the seed.
  const includeSeed = mode !== "app";

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(includeSeed ? [] : [excludeSeedFromAppBuild()]),
    ],

    // Read by the seed glob in src/App.tsx. A `define` rather than a runtime
    // check, so the false branch is dropped and the seed module is never
    // bundled into a shipped build.
    define: includeSeed
      ? {}
      : { "import.meta.env.VITE_INKLING_SEED": JSON.stringify("0") },

    build: {
      // Tauri ships an evergreen Chromium webview (WebView2), so build for
      // modern syntax: smaller output, no transpilation helpers, no
      // modulepreload polyfill. No visual or behavioral effect.
      target: "chrome120",
      modulePreload: { polyfill: false },
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      allowedHosts: true,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
