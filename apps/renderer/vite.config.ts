import babel from "@rolldown/plugin-babel";
import stylex from "@stylexjs/unplugin";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
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
  ],
  build: {
    // `build:web` (mode preview) carries the demo seed, so it never lands where the app is packed from.
    outDir: `${workspace}/dist/${mode === "preview" ? "web" : "renderer"}`,
    emptyOutDir: true,
    target: "chrome140",
    // Fonts are tiny next to the bundle and must not turn into data: URLs.
    assetsInlineLimit: 0,
  },
}));
