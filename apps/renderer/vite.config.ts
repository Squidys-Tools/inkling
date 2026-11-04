import babel from "@rolldown/plugin-babel";
import stylex from "@stylexjs/unplugin";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, type Plugin } from "vite";
import { thirdPartyLicenses } from "./licenses/plugin.ts";

const workspace = fileURLToPath(new URL("../..", import.meta.url));

// The app has no stylesheet of its own for StyleX to append to, so it writes
// stylex.css beside the bundle and the page links it here.
const linkStylexCss = (command: "build" | "serve"): Plugin => ({
  name: "inkling-link-stylex-css",
  transformIndexHtml: () => [
    {
      tag: "link",
      attrs: {
        rel: "stylesheet",
        href: command === "serve" ? "/virtual:stylex.css" : "./assets/stylex.css",
      },
      injectTo: "head",
    },
  ],
});

const previewSeed = normalizePath(
  fileURLToPath(new URL("src/library/preview/seed.ts", import.meta.url)),
);
const siteSeed = normalizePath(
  fileURLToPath(new URL("src/library/preview/site/seed.ts", import.meta.url)),
);

// The marketing site's /demo/: the web preview on a seed the site may publish,
// under a CSP of its own, since the desktop app's comes from the app:// protocol.
const siteDemo = (): Plugin => ({
  name: "inkling-site-demo",
  load: (id) => (id === previewSeed ? `export * from ${JSON.stringify(siteSeed)};` : null),
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content:
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'",
      },
      injectTo: "head-prepend",
    },
  ],
});

const outDirs: Record<string, string> = {
  production: "dist/renderer",
  // `build:web` carries the demo seed, so it never lands where the app is packed from.
  preview: "dist/web",
  site: "apps/site/public/demo",
};

export default defineConfig(({ command, mode }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // app://local/ serves the build from its own folder, so asset URLs stay relative.
  base: "./",
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      dev: command === "serve",
      unstable_moduleResolution: { type: "commonJS", rootDir: workspace },
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    linkStylexCss(command),
    thirdPartyLicenses(workspace),
    mode === "site" && siteDemo(),
  ],
  build: {
    outDir: `${workspace}/${outDirs[mode] ?? outDirs.production}`,
    emptyOutDir: true,
    target: "chrome140",
    // Fonts are tiny next to the bundle and must not turn into data: URLs.
    assetsInlineLimit: 0,
  },
}));
