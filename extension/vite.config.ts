import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.chrome.json";

// crxjs bundles the manifest pipeline: popup html + module service worker +
// the declarative content script (content.js — needed by context-menu collect
// via tabs.sendMessage). Injected-on-invoke scripts (content-main/isolated)
// are built separately by vite.content-*.config.ts, so this build must not
// wipe them: emptyOutDir stays off.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    emptyOutDir: false,
  },
});
