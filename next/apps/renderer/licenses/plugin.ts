import type { Plugin } from "vite";
import { collectThirdPartyLicenses, packageDirOf } from "./collect.ts";

const LICENSES_FILE = "third-party-licenses.json";

/**
 * Writes the notices Settings → Open source licenses fetches beside index.html,
 * so they stay out of the bundle until someone looks. The build lists the
 * packages the bundle took modules from; the dev server, which bundles nothing,
 * lists the production dependencies and vendored code only.
 */
export function thirdPartyLicenses(workspaceDir: string): Plugin {
  return {
    name: "inkling-third-party-licenses",
    configureServer(server) {
      server.middlewares.use(`/${LICENSES_FILE}`, (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(collectThirdPartyLicenses(workspaceDir).entries));
      });
    },
    generateBundle() {
      const bundled = new Set<string>();
      for (const id of this.getModuleIds()) {
        const dir = packageDirOf(id);
        if (dir) bundled.add(dir);
      }
      const { entries, warnings } = collectThirdPartyLicenses(workspaceDir, bundled);
      for (const warning of warnings) this.warn(warning);
      this.emitFile({ type: "asset", fileName: LICENSES_FILE, source: JSON.stringify(entries) });
    },
  };
}
