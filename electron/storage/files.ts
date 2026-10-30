import { randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { types } from "node:util";
import { Effect } from "effect";
import type { SaveFileInput } from "@inkling/contracts";
import type { StorageContext } from "./context.ts";
import { writtenItem } from "./rows.ts";
import { isInside, nonEmpty } from "./shared.ts";
import { attempt, invalidInput } from "./errors.ts";
import { IMAGE_THUMBNAIL_JOB, VIDEO_POSTER_JOB } from "./jobs.ts";

const maxFileBytes = 50 * 1024 * 1024;

const sanitizeFileName = Effect.fnUntraced(function* (value: string) {
  let name = Array.from(value.trim(), (character) =>
    /[\\/:*?"<>|]/.test(character) || /\p{Cc}/u.test(character) ? "_" : character,
  ).join("");
  while (name.endsWith(".") || name.endsWith(" ")) name = name.slice(0, -1);
  if (!name || name === "." || name === "..") {
    return yield* invalidInput("fileName must contain a usable file name");
  }
  name = Array.from(name).slice(0, 128).join("");
  if (name.startsWith(".")) name = `_${name}`;
  const stem = name.split(".")[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) name = `_${name}`;
  return name;
});

// File bytes cross IPC as a Uint8Array or ArrayBuffer, which structured clone
// moves as one block. A number array would be several times larger and slow.
const fileInputBuffer = Effect.fnUntraced(function* (value: unknown) {
  if (types.isAnyArrayBuffer(value)) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return yield* invalidInput("file bytes must be a Uint8Array or ArrayBuffer");
});

const normalizeFileKind = Effect.fnUntraced(function* (
  kind: string | null | undefined,
  mimeType: string | null,
  fileName: string,
) {
  const requested = nonEmpty(kind)?.toLowerCase();
  if (requested) {
    if (requested === "image" || requested === "pdf" || requested === "video") return requested;
    if (requested === "file" || requested === "other") return "file";
    return yield* invalidInput("kind must be image, pdf, video, or file");
  }
  const extension = extname(fileName).slice(1).toLowerCase();
  if (
    mimeType?.startsWith("image/") ||
    ["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "tif", "tiff", "webp"].includes(extension)
  )
    return "image";
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (
    mimeType?.startsWith("video/") ||
    ["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "webm", "wmv"].includes(extension)
  )
    return "video";
  return "file";
});

export function makeFiles(ctx: StorageContext) {
  const { sql, jobs } = ctx;

  const saveFile = Effect.fnUntraced(function* (input: SaveFileInput) {
    const fileName = yield* sanitizeFileName(input.fileName);
    const id = randomUUID();
    const mimeType = nonEmpty(input.mimeType)?.toLowerCase() ?? null;
    const kind = yield* normalizeFileKind(input.kind, mimeType, fileName);
    const bytes = yield* fileInputBuffer(input.bytes);
    if (bytes.length > maxFileBytes)
      return yield* invalidInput("file exceeds the 50 MB input limit");
    if (bytes.length === 0) return yield* invalidInput("file bytes cannot be empty");
    // Header only: it refuses a non-image or oversized one and gives the card its
    // shape. Resizing is the image_thumbnail job's work, never capture's.
    const inspectImage = ctx.media.inspectImage;
    const size =
      kind === "image" && inspectImage ? yield* attempt(() => inspectImage(bytes)) : null;
    const itemDirectory = join(ctx.assetsDirectory, id);
    yield* attempt(() => mkdir(itemDirectory, { recursive: true }));
    yield* attempt(() => writeFile(join(itemDirectory, fileName), bytes));
    const metadata = JSON.stringify({
      fileName,
      mimeType,
      byteLength: bytes.length,
      ...(size ? { mediaWidth: size.width, mediaHeight: size.height } : {}),
    });
    const assetPath = `assets/items/${id}/${fileName}`;
    const now = Date.now();
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO items (id, kind, title, body, body_format, source_label,
          local_asset_path, metadata, ocr_text, created_at, updated_at)
          VALUES (${id}, ${kind}, ${fileName}, '', 'md', ${mimeType}, ${assetPath}, ${metadata}, '',
          ${now}, ${now})`;
        if (kind === "image") {
          // The palette job reads the thumbnail, so the thumbnail job queues it.
          yield* jobs.enqueue(id, IMAGE_THUMBNAIL_JOB);
          yield* jobs.enqueue(id, "ocr_image");
        }
        if (kind === "pdf") yield* jobs.enqueue(id, "ocr_pdf_page");
        // Queued ahead of the embedding so the card gets its poster before model loading.
        if (kind === "video") yield* jobs.enqueue(id, VIDEO_POSTER_JOB);
        yield* jobs.enqueue(id, "generate_embedding");
      }),
    );
    return yield* writtenItem(ctx, id);
  });

  const resolveAssetPath = Effect.fnUntraced(function* (assetPath: string) {
    const normalized = assetPath.replaceAll("\\", "/");
    if (!normalized.startsWith("assets/"))
      return yield* invalidInput("asset path must be relative to the managed assets directory");
    const parts = normalized.slice("assets/".length).split("/");
    if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
      return yield* invalidInput("asset path contains an unsafe segment");
    }
    const candidate = resolve(ctx.assetsRoot, ...parts);
    if (!isInside(candidate, ctx.assetsRoot))
      return yield* invalidInput("asset path escaped the managed assets directory");
    const realCandidate = yield* attempt(() => realpath(candidate));
    const root = yield* attempt(() => realpath(ctx.assetsRoot));
    if (!isInside(realCandidate, root))
      return yield* invalidInput("asset path escaped the managed assets directory");
    return realCandidate;
  });

  return { saveFile, resolveAssetPath };
}
