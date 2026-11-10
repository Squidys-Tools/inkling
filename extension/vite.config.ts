import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { stylexPlugin } from "../apps/renderer/stylexPlugin.ts";
import manifest from "./manifest.chrome.json" with { type: "json" };

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
    stylexPlugin(command),
    react({ compiler: true }),
    linkStylexCss(command),
    crx({ manifest }),
  ],
  build: { target: "chrome116" },
}));
