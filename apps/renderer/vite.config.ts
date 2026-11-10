import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, type Plugin } from "vite";
import { findSeedLeaks } from "../../tools/repo/assert-no-demo-seed.ts";
import { thirdPartyLicenses } from "./licenses/plugin.ts";
import { stylexPlugin } from "./stylexPlugin.ts";

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

const siteSeed = normalizePath(
  fileURLToPath(new URL("./src/library/preview/site/seed.ts", import.meta.url)),
);

// The marketing site's /demo/: the web preview on a seed the site may publish,
// under a CSP of its own, since the desktop app's comes from the app:// protocol.
// A suffix match, because a resolved id can differ from fileURLToPath in case or
// symlinks; generateBundle fails the build if the dev seed still gets in.
const siteDemo = (): Plugin => ({
  name: "inkling-site-demo",
  load: (id) =>
    id.endsWith("/src/library/preview/seed.ts")
      ? `export * from ${JSON.stringify(siteSeed)};`
      : null,
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content:
          "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'",
      },
      injectTo: "head-prepend",
    },
  ],
  generateBundle(_options, bundle) {
    const leaks = findSeedLeaks(Object.keys(bundle), (name) => {
      const output = bundle[name];
      return output.type === "chunk" ? output.code : String(output.source);
    });
    if (leaks.length > 0)
      this.error(
        `The dev seed reached the site's /demo/: ${leaks.map((leak) => `${leak.path} (${leak.reason})`).join(", ")}`,
      );
  },
});

const outDirs: Record<string, string> = {
  production: "dist/renderer",
  // `build:web` carries the demo seed, so it never lands where the app is packed from.
  preview: "dist/web",
  site: "apps/site/public/demo",
};

export default defineConfig(({ command, mode }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // app://local/ serves the build from its own folder, so asset URLs stay relative.
  base: "./",
  plugins: [
    stylexPlugin(command),
    react({ compiler: true }),
    linkStylexCss(command),
    thirdPartyLicenses(workspace),
    mode === "site" && siteDemo(),
  ],
  build: {
    outDir: `${workspace}/${outDirs[mode] ?? outDirs.production}`,
    emptyOutDir: true,
    target: "chrome140",
    // Fonts are tiny next to the bundle and must not turn into data: URLs.
    assetsInlineLimit: 0,
  },
}));
