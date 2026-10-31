import babel from "@rolldown/plugin-babel";
import stylex from "@stylexjs/unplugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { imagetools } from "vite-imagetools";
import { latestRelease } from "./latestRelease.ts";

const workspace = fileURLToPath(new URL("../..", import.meta.url));
const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = production ? `https://${production}` : "";

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: { "import.meta.env.VITE_SITE_URL": JSON.stringify(siteUrl) },
  server: { host: true, port: 5180, strictPort: true, allowedHosts: true },
  plugins: [
    // The demo seed's photos are full camera files; the cards only ever show them at column width.
    imagetools({
      include: /\/seed-demo\/[^?]+\.jpg\?/u,
      defaultDirectives: () => new URLSearchParams({ w: "480", format: "webp", quality: "70" }),
    }),
    latestRelease(),
    stylex.vite({
      useCSSLayers: true,
      dev: command === "serve",
      unstable_moduleResolution: { type: "commonJS", rootDir: workspace },
    }),
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true },
      pages: [{ path: "/404", prerender: { outputPath: "/404.html" }, sitemap: { exclude: true } }],
      sitemap: { enabled: siteUrl !== "", host: siteUrl },
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
}));
