import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.chrome.json";

// crxjs bundles the manifest pipeline: popup html + module service worker.
// The context-menu collector and the on-demand extractors are injected on
// invoke instead, built separately by vite.content-*.config.ts, so this build
// must not wipe them: emptyOutDir stays off.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    emptyOutDir: false,
  },
});
