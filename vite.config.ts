import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { collectThirdPartyLicenses } from "./scripts/third-party-licenses/collect.mjs";

const LICENSES_FILE = "third-party-licenses.json";

// Settings → General → Open source licenses fetches this file beside
// index.html, so the notices stay out of the app bundle until someone looks.
function thirdPartyLicenses(): Plugin {
  const collect = () => collectThirdPartyLicenses(fileURLToPath(new URL(".", import.meta.url)));
  return {
    name: "inkling-third-party-licenses",
    configureServer(server) {
      server.middlewares.use(`/${LICENSES_FILE}`, (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(collect().entries));
      });
    },
    generateBundle() {
      const { entries, warnings } = collect();
      for (const warning of warnings) this.warn(warning);
      this.emitFile({ type: "asset", fileName: LICENSES_FILE, source: JSON.stringify(entries) });
    },
  };
}

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

// The demo seed must be dropped at build time: by the time a runtime `if` runs,
// Vite has already copied public/ and bundled src/seedPersonal.ts. Gated on
// `--mode app` because a `VAR=x` script prefix fails in Windows `cmd`.
export default defineConfig(async ({ mode }) => {
  // `app` is the shipped Electron build. Every other mode — dev, and the default
  // production build used by `vite preview` and the web preview deploy — keeps
  // the seed.
  const includeSeed = mode !== "app";

  return {
    plugins: includeSeed
      ? [react(), tailwindcss(), thirdPartyLicenses()]
      : [react(), tailwindcss(), thirdPartyLicenses(), excludeSeedFromAppBuild()],

    // Read by the seed glob in src/features/library/seed.ts. A `define` rather
    // than a runtime check, so the false branch is dropped and the seed module
    // is never bundled into a shipped build.
    define: includeSeed ? {} : { "import.meta.env.VITE_INKLING_SEED": JSON.stringify("0") },

    build: {
      // Electron ships an evergreen Chromium webview, so build for
      // modern syntax: smaller output, no transpilation helpers, no
      // modulepreload polyfill. No visual or behavioral effect.
      target: "chrome120",
      modulePreload: { polyfill: false },
    },
  };
});
