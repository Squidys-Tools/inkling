import { app, protocol, session } from "electron";
import { join } from "node:path";
import { appContentTypes } from "./app-content-types.ts";
import { serveAssetFile } from "./asset-response.ts";
import { contentSecurityPolicy } from "./content-security-policy.ts";

export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      // stream lets <video> and <audio> issue Range requests against the asset handler.
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true,
      },
    },
  ]);
}

// Remote card images load with crossorigin so the liquid glass canvas can draw
// them (Chromium paints opaque cross-origin images blank). Most hosts send no
// CORS header, so the app's session adds one to image responses. The requests
// themselves are unchanged.
export function allowCanvasReadableImages() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["https://*/*"] },
    ({ resourceType, responseHeaders }, callback) => {
      if (resourceType !== "image") return callback({});
      const headers = Object.fromEntries(
        Object.entries(responseHeaders ?? {}).filter(
          ([name]) => name.toLowerCase() !== "access-control-allow-origin",
        ),
      );
      callback({ responseHeaders: { ...headers, "Access-Control-Allow-Origin": ["*"] } });
    },
  );
}

export function createAppAssetHandler(rendererDirectory: string) {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.hostname !== "local") return new Response(null, { status: 404 });

    let requestPath: string;
    try {
      requestPath = decodeURIComponent(url.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (requestPath === "/" || requestPath.endsWith("/")) requestPath += "index.html";

    const libraryAssetPrefix = "/library-assets/";
    const isLibraryAsset = requestPath.startsWith(libraryAssetPrefix);
    const assetDirectory = isLibraryAsset
      ? join(app.getPath("userData"), "assets")
      : rendererDirectory;
    const relativeRequestPath = isLibraryAsset
      ? `/${requestPath.slice(libraryAssetPrefix.length)}`
      : requestPath;
    return serveAssetFile(request, {
      root: assetDirectory,
      path: relativeRequestPath,
      contentTypes: appContentTypes,
      headers: { "Content-Security-Policy": contentSecurityPolicy },
    });
  };
}
