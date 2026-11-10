import stylex from "@stylexjs/unplugin";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import type { Plugin } from "vite";

const EXTENSIONS = ["", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"];

// StyleX resolves a tokens import again for every token a file reads, and its
// own resolver stats the disk each time. These two give the answers its
// `commonJS` mode gives, once per folder: a different canonical path would
// change every variable's hashed name.
function cachedResolution() {
  const resolved = new Map<string, string>();
  const packages = new Map<string, readonly [string, string] | null>();

  const packageOf = (dir: string): readonly [string, string] | null => {
    const known = packages.get(dir);
    if (known !== undefined) return known;
    const path = join(dir, "package.json");
    const parent = dirname(dir);
    const manifest: { name?: string } | null = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : null;
    const found = manifest
      ? ([String(manifest.name), dir] as const)
      : parent === dir
        ? null
        : packageOf(parent);
    packages.set(dir, found);
    return found;
  };

  return {
    type: "custom" as const,
    filePathResolver(importPath: string, sourceFilePath: string) {
      const key = JSON.stringify([dirname(sourceFilePath), importPath]);
      const known = resolved.get(key);
      if (known) return known;
      const require = createRequire(sourceFilePath);
      for (const extension of EXTENSIONS) {
        try {
          const found = require.resolve(importPath + extension);
          resolved.set(key, found);
          return found;
        } catch {}
      }
      // A miss is not cached: the file may be created while the dev server runs.
      return undefined;
    },
    getCanonicalFilePath(filePath: string) {
      const found = packageOf(dirname(filePath));
      return found ? `${found[0]}:${relative(found[1], filePath)}` : filePath;
    },
  };
}

/**
 * StyleX for both Vite configs. The plugin's own hook runs in JavaScript for
 * every module and only then looks for the import; the filter lets Rolldown
 * skip that call for the modules that never mention StyleX.
 */
export function stylexPlugin(command: "build" | "serve"): Plugin {
  const plugin = stylex.vite({
    useCSSLayers: true,
    dev: command === "serve",
    unstable_moduleResolution: cachedResolution(),
  }) as Plugin;
  const { transform } = plugin;
  if (typeof transform !== "function") return plugin;
  return { ...plugin, transform: { filter: { code: "@stylexjs/stylex" }, handler: transform } };
}
