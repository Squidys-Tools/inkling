import { existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

/**
 * Serves the benchmark corpus over localhost so the real ingestion pipeline
 * (http/https URLs only) can fetch fixtures exactly as it would fetch a live page.
 */
export function startCorpusServer(root: string) {
  const rootResolved = resolve(root);
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const rel = decodeURIComponent(url.pathname)
        .replace(/^[/\\]+/, "")
        .replace(/\//g, sep);
      const filePath = resolve(rootResolved, rel);
      if (!filePath.startsWith(rootResolved + sep) && filePath !== rootResolved) {
        return new Response("forbidden", { status: 403 });
      }
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        return new Response("not found", { status: 404 });
      }
      return new Response(Bun.file(filePath));
    },
  });
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}
