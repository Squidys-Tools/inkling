import babel from "@rolldown/plugin-babel";
import stylex from "@stylexjs/unplugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { imagetools } from "vite-imagetools";

const workspace = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { host: true, port: 5180, strictPort: true, allowedHosts: true },
  plugins: [
    // The demo seed's photos are full camera files; the cards only ever show them at column width.
    imagetools({
      include: /\/seed-demo\/[^?]+\.jpg\?/u,
      defaultDirectives: () => new URLSearchParams({ w: "480", format: "webp", quality: "70" }),
    }),
    stylex.vite({
      useCSSLayers: true,
      dev: command === "serve",
      unstable_moduleResolution: { type: "commonJS", rootDir: workspace },
    }),
    tanstackStart({ prerender: { enabled: true, crawlLinks: true } }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
}));
