import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.chrome.json";

// crxjs bundles the manifest pipeline: popup html + module service worker.
// Content scripts are NOT in the manifest (no <all_urls>, no auto-run) — they
// are built separately by vite.content-main/isolated.config.ts and injected on invoke via
// chrome.scripting, so this build must not wipe them: emptyOutDir stays off.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    emptyOutDir: false,
  },
});
