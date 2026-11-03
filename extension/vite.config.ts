import babel from "@rolldown/plugin-babel";
import { crx } from "@crxjs/vite-plugin";
import stylex from "@stylexjs/unplugin";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import manifest from "./manifest.chrome.json" with { type: "json" };

const workspace = fileURLToPath(new URL("..", import.meta.url));

// StyleX writes stylex.css beside the bundle; the popup links it, as the app's window does.
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

export default defineConfig(({ command }) => ({
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      dev: command === "serve",
      unstable_moduleResolution: { type: "commonJS", rootDir: workspace },
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    linkStylexCss(command),
    crx({ manifest }),
  ],
  build: { target: "chrome116" },
}));
