import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { Readable } from "node:stream";

// Returns the byte window to serve, "unsatisfiable", or null when the header has to be ignored.
// Multiple ranges, other units and malformed specs are ignored: RFC 9110 lets a server answer
// those with the whole file, and a multipart body is not worth it for local media.
function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;
  const [, first, last] = match;
  if (!first && !last) return null;
  if (!first) {
    const suffixLength = Number(last);
    if (suffixLength === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(first);
  if (last && Number(last) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end: Math.min(last ? Number(last) : size - 1, size - 1) };
}

// Serves a file under `root` without reading it into memory, so a large video or PDF starts
// playing before it is loaded and seeks through Range requests.
export async function serveAssetFile(
  request: Request,
  {
    root,
    path,
    contentTypes,
    headers,
  }: {
    root: string;
    path: string;
    contentTypes: Record<string, string>;
    headers?: Record<string, string>;
  },
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const filePath = resolve(root, `.${path}`);
  const pathFromRoot = relative(root, filePath);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    return new Response(null, { status: 403 });
  }

  try {
    const [realRoot, realFile, fileStat] = await Promise.all([
      realpath(root),
      realpath(filePath),
      stat(filePath),
    ]);
    const realRelativePath = relative(realRoot, realFile);
    if (!fileStat.isFile() || realRelativePath.startsWith("..") || isAbsolute(realRelativePath)) {
      return new Response(null, { status: 403 });
    }

    const { size } = fileStat;
    // Asset URLs are not versioned (thumbnail.webp is rewritten in place), so these are
    // validators only and no response may be marked immutable.
    const etag = `"${Math.floor(fileStat.mtimeMs).toString(16)}-${size.toString(16)}"`;
    const lastModified = fileStat.mtime.toUTCString();

    const rangeHeader = request.headers.get("Range");
    const ifRange = request.headers.get("If-Range");
    // A stale If-Range means the file changed since the client's earlier bytes: send it all.
    const range =
      rangeHeader && (!ifRange || ifRange === etag || ifRange === lastModified)
        ? parseRange(rangeHeader, size)
        : null;
    if (range === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${size}` },
      });
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const length = end - start + 1;
    const responseHeaders = {
      ...headers,
      "Accept-Ranges": "bytes",
      "Content-Length": String(length),
      "Content-Type": contentTypes[extname(realFile).toLowerCase()] ?? "application/octet-stream",
      ETag: etag,
      "Last-Modified": lastModified,
      ...(realFile.endsWith("thumbnail.webp") ? { "Cache-Control": "no-cache" } : {}),
      "X-Content-Type-Options": "nosniff",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    };
    const body =
      request.method === "HEAD" || length === 0
        ? null
        : (Readable.toWeb(
            createReadStream(realFile, { start, end }),
          ) as ReadableStream<Uint8Array>);
    return new Response(body, { status: range ? 206 : 200, headers: responseHeaders });
  } catch {
    return new Response(null, { status: 404 });
  }
}
