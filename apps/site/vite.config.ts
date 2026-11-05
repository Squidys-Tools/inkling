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
  plugins: [
    // The demo seed's photos are full camera files; the cards only ever show them at column width.
    // The /plains media name their own sizes and formats in each import.
    imagetools({
      include: [
        /\/seed-demo\/[^?]+\.jpg\?/u,
        /\/plains\/media\/[^?]+\.(?:jpg|png|webp)\?/u,
        /\/cards\/assets\/typed-texture\.png\?/u,
      ],
      defaultDirectives: (url) =>
        url.pathname.includes("/seed-demo/")
          ? new URLSearchParams({ w: "480", format: "webp", quality: "70" })
          : new URLSearchParams(),
    }),
    latestRelease(),
    stylex.vite({
      useCSSLayers: true,
      dev: command === "serve",
      unstable_moduleResolution: { type: "commonJS", rootDir: workspace },
    }),
    tanstackStart({
      // The homepage links public images; crawling them as pages corrupts binary copies.
      prerender: { enabled: true, crawlLinks: false },
      pages: [
        { path: "/" },
        { path: "/download" },
        { path: "/features" },
        { path: "/privacy" },
        { path: "/credits" },
        { path: "/plains", sitemap: { exclude: true } },
        { path: "/404", prerender: { outputPath: "/404.html" }, sitemap: { exclude: true } },
      ],
      sitemap: { enabled: siteUrl !== "", host: siteUrl },
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
}));
