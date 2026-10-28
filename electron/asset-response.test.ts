import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveAssetFile } from "./asset-response.ts";

const contentTypes = { ".mp4": "video/mp4", ".webp": "image/webp" };
const bytes = Buffer.from(Array.from({ length: 1000 }, (_, index) => index % 251));

let sandbox: string;
let root: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "inkling-asset-"));
  root = join(sandbox, "assets");
  await mkdir(join(root, "items", "a"), { recursive: true });
  await writeFile(join(root, "items", "a", "clip.mp4"), bytes);
  await writeFile(join(root, "items", "a", "empty.webp"), "");
  await writeFile(join(root, "items", "a", "notes.xyz"), "plain");
  await writeFile(join(sandbox, "secret.txt"), "outside");
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function serve(path: string, init: RequestInit = {}) {
  return serveAssetFile(new Request("app://local/library-assets/clip", init), {
    root,
    path,
    contentTypes,
    headers: { "Content-Security-Policy": "default-src 'self'" },
  });
}

const clip = "/items/a/clip.mp4";

async function body(response: Response) {
  return Buffer.from(await response.arrayBuffer());
}

test("a full GET streams the file with its headers", async () => {
  const response = await serve(clip);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Length")).toBe("1000");
  expect(response.headers.get("Content-Type")).toBe("video/mp4");
  expect(response.headers.get("Accept-Ranges")).toBe("bytes");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'self'");
  expect(response.headers.get("ETag")).toMatch(/^"[0-9a-f]+-3e8"$/);
  expect(response.headers.get("Last-Modified")).toBeTruthy();
  expect(response.headers.get("Cache-Control")).toBeNull();
  expect(await body(response)).toEqual(bytes);
});

test("rewritten thumbnails always revalidate and return current bytes", async () => {
  const path = "/items/a/thumbnail.webp";
  await writeFile(join(root, "items", "a", "thumbnail.webp"), "before");
  const before = await serve(path);
  expect(before.headers.get("Cache-Control")).toBe("no-cache");
  expect((await body(before)).toString()).toBe("before");
  await writeFile(join(root, "items", "a", "thumbnail.webp"), "after!");
  const after = await serve(path, { headers: { "If-None-Match": before.headers.get("ETag")! } });
  expect(after.status).toBe(200);
  expect(after.headers.get("Cache-Control")).toBe("no-cache");
  expect((await body(after)).toString()).toBe("after!");
});

test("a large file arrives in chunks instead of one read", async () => {
  const large = Buffer.alloc(8 * 1024 * 1024, 7);
  await writeFile(join(root, "items", "a", "large.mp4"), large);
  const response = await serve("/items/a/large.mp4");
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const first = await reader.read();
  await reader.cancel();
  expect(first.value?.length).toBeGreaterThan(0);
  expect(first.value?.length).toBeLessThan(large.length);
});

test("HEAD answers with the headers and no body", async () => {
  const response = await serve(clip, { method: "HEAD" });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Length")).toBe("1000");
  expect(response.headers.get("Content-Type")).toBe("video/mp4");
  expect(response.body).toBeNull();
});

test("a byte range answers 206 with just those bytes", async () => {
  const response = await serve(clip, { headers: { Range: "bytes=100-199" } });
  expect(response.status).toBe(206);
  expect(response.headers.get("Content-Range")).toBe("bytes 100-199/1000");
  expect(response.headers.get("Content-Length")).toBe("100");
  expect(await body(response)).toEqual(bytes.subarray(100, 200));
});

test("open-ended, suffix and overlong ranges are clamped to the file", async () => {
  const openEnded = await serve(clip, { headers: { Range: "bytes=900-" } });
  expect(openEnded.status).toBe(206);
  expect(openEnded.headers.get("Content-Range")).toBe("bytes 900-999/1000");
  expect(await body(openEnded)).toEqual(bytes.subarray(900));

  const suffix = await serve(clip, { headers: { Range: "bytes=-100" } });
  expect(suffix.status).toBe(206);
  expect(suffix.headers.get("Content-Range")).toBe("bytes 900-999/1000");
  expect(await body(suffix)).toEqual(bytes.subarray(900));

  const pastEnd = await serve(clip, { headers: { Range: "bytes=990-5000" } });
  expect(pastEnd.headers.get("Content-Range")).toBe("bytes 990-999/1000");
  expect(await body(pastEnd)).toEqual(bytes.subarray(990));

  const longSuffix = await serve(clip, { headers: { Range: "bytes=-5000" } });
  expect(longSuffix.status).toBe(206);
  expect(longSuffix.headers.get("Content-Range")).toBe("bytes 0-999/1000");
});

test("HEAD with a range reports the slice without a body", async () => {
  const response = await serve(clip, { method: "HEAD", headers: { Range: "bytes=10-19" } });
  expect(response.status).toBe(206);
  expect(response.headers.get("Content-Range")).toBe("bytes 10-19/1000");
  expect(response.headers.get("Content-Length")).toBe("10");
  expect(response.body).toBeNull();
});

test("a range past the end answers 416 with the file size", async () => {
  for (const range of ["bytes=1000-", "bytes=2000-3000", "bytes=-0"]) {
    const response = await serve(clip, { headers: { Range: range } });
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */1000");
    expect(response.body).toBeNull();
  }
  const empty = await serve("/items/a/empty.webp", { headers: { Range: "bytes=0-" } });
  expect(empty.status).toBe(416);
  expect(empty.headers.get("Content-Range")).toBe("bytes */0");
});

test("a malformed or unsupported range is ignored and the whole file is sent", async () => {
  for (const range of ["bytes=abc", "bytes=5-2", "bytes=0-1,5-6", "items=0-1", "bytes=-", "0-10"]) {
    const response = await serve(clip, { headers: { Range: range } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(await body(response)).toEqual(bytes);
  }
});

test("an empty file is a 200 with no body", async () => {
  const response = await serve("/items/a/empty.webp");
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Length")).toBe("0");
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect((await body(response)).length).toBe(0);
});

test("If-Range only honors the range while the file is unchanged", async () => {
  const etag = (await serve(clip, { method: "HEAD" })).headers.get("ETag") ?? "";
  const fresh = await serve(clip, { headers: { Range: "bytes=0-9", "If-Range": etag } });
  expect(fresh.status).toBe(206);
  const stale = await serve(clip, { headers: { Range: "bytes=0-9", "If-Range": '"stale"' } });
  expect(stale.status).toBe(200);
  expect(await body(stale)).toEqual(bytes);
});

test("only GET and HEAD are served", async () => {
  const response = await serve(clip, { method: "POST", body: "x" });
  expect(response.status).toBe(405);
  expect(response.headers.get("Allow")).toBe("GET, HEAD");
});

test("paths that leave the assets directory are rejected", async () => {
  expect((await serve("/../secret.txt")).status).toBe(403);
  expect((await serve("/items/a/../../../secret.txt")).status).toBe(403);
});

test("a link that resolves outside the assets directory is rejected", async () => {
  // A junction needs no privileges on Windows; elsewhere it is a plain symlink.
  await symlink(sandbox, join(root, "items", "escape"), "junction");
  expect((await serve("/items/escape/secret.txt")).status).toBe(403);
});

test("directories and missing files are not served", async () => {
  expect((await serve("/items/a")).status).toBe(403);
  expect((await serve("/items/a/missing.mp4")).status).toBe(404);
});
