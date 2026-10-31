import { protocol } from "electron";
import { join } from "node:path";
import { appContentTypes } from "./app-content-types.ts";
import { serveAssetFile } from "./asset-response.ts";
import { contentSecurityPolicy } from "./content-security-policy.ts";

/** Must run before `app.whenReady`. */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      // stream lets <video> and <audio> issue Range requests against the asset handler.
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

const libraryAssetPrefix = "/library-assets/";

/** `app://local/` serves the renderer build; `app://local/library-assets/` the library's assets. */
export function handleAppScheme({
  rendererDirectory,
  assetsDirectory,
}: {
  rendererDirectory: string;
  assetsDirectory: string;
}) {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "local") return new Response(null, { status: 404 });
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (path === "/" || path.endsWith("/")) path += "index.html";
    const isAsset = path.startsWith(libraryAssetPrefix);
    return serveAssetFile(request, {
      root: isAsset ? assetsDirectory : rendererDirectory,
      path: isAsset ? `/${path.slice(libraryAssetPrefix.length)}` : path,
      contentTypes: appContentTypes,
      headers: { "Content-Security-Policy": contentSecurityPolicy },
    });
  });
}

export const appUrl = (query = "") => `app://local/index.html${query}`;
export const assetsDirectoryOf = (libraryDirectory: string) => join(libraryDirectory, "assets");
