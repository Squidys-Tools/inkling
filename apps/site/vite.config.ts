import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { imagetools } from "vite-imagetools";
import { stylexPlugin } from "../renderer/stylexPlugin.ts";
import { demoIndex } from "./demoIndex.ts";
import { latestRelease } from "./latestRelease.ts";

const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = production ? `https://${production}` : "";

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: { "import.meta.env.VITE_SITE_URL": JSON.stringify(siteUrl) },
  plugins: [
    // The demo seed's photos are full camera files; the cards only ever show them at column width.
    imagetools({
      include: /\/seed-demo\/[^?]+\.jpg\?/u,
      defaultDirectives: () => new URLSearchParams({ w: "480", format: "webp", quality: "70" }),
    }),
    demoIndex(),
    latestRelease(),
    stylexPlugin(command),
    tanstackStart({
      // The homepage links public images; crawling them as pages corrupts binary copies.
      prerender: { enabled: true, crawlLinks: false },
      pages: [
        { path: "/" },
        { path: "/download" },
        { path: "/features" },
        { path: "/privacy" },
        { path: "/credits" },
        { path: "/waitlist", sitemap: { exclude: true } },
        { path: "/404", prerender: { outputPath: "/404.html" }, sitemap: { exclude: true } },
      ],
      sitemap: { enabled: siteUrl !== "", host: siteUrl },
    }),
    react({ compiler: true }),
  ],
}));
