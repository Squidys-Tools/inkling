import type { ItemDetail } from "@inkling/contracts";
import { constants } from "node:fs";
import { mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { resolveLibraryAsset } from "./library-asset.ts";

type TransferItem = Pick<
  ItemDetail,
  "kind" | "title" | "body" | "bodyFormat" | "sourceUrl" | "localAssetPath"
>;
// The library's own limit on a saved file.
const maxImageBytes = 50 * 1024 * 1024;
// At 200 MP the clipboard reports success and holds nothing; 40 MP pastes back whole.
const maxCopyPixels = 40_000_000;
// The most the jobs read, so copying asks no more of sharp than saving did. These match
// packages/jobs/src/thumbnail.ts: formats outside the set are decoded whole.
const maxSourcePixels = 500_000_000;
const maxWholeDecodePixels = 100_000_000;
const readsAtReducedSize = new Set(["jpeg", "png", "webp"]);
const maxExportBytes = 1024 * 1024;

/** Only main resolves files; the page supplies an item id, never an OS path. */
export function createItemTransfer({
  assetsDirectory,
  temporaryDirectory,
  item,
}: {
  assetsDirectory: string;
  temporaryDirectory: string;
  item: (id: string) => Promise<TransferItem | null>;
}) {
  let directory: Promise<string> | undefined;
  const exports: string[] = [];
  let sequence = 0;
  let copying = false;
  let closed = false;
  let closing: Promise<void> | undefined;
  const active = new Set<Promise<unknown>>();
  function run<T>(action: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new Error("Item sharing is closed."));
    const pending = Promise.resolve().then(action);
    active.add(pending);
    void pending.then(
      () => active.delete(pending),
      () => active.delete(pending),
    );
    return pending;
  }
  const read = async (id: string) => {
    if (!id || id.length > 500 || id.includes("\0")) throw new Error("Invalid item.");
    const found = await item(id);
    if (closed) throw new Error("Item sharing is closed.");
    if (!found) throw new Error("This item is no longer in the library.");
    return found;
  };
  const local = async (found: TransferItem) => {
    const path =
      found.localAssetPath && (await resolveLibraryAsset(assetsDirectory, found.localAssetPath));
    if (!path || !(await stat(path)).isFile()) throw new Error("This item's file is missing.");
    return path;
  };
  return {
    image: (id: string) =>
      run(async () => {
        if (copying) throw new Error("An image is already being copied.");
        copying = true;
        try {
          const found = await read(id);
          if (found.kind !== "image")
            throw new Error("Only saved images can be copied as an image.");
          const file = await open(
            await local(found),
            constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
          );
          try {
            const info = await file.stat();
            if (!info.isFile() || info.size <= 0 || info.size > maxImageBytes)
              throw new Error("This image is too large to copy. Drag its file instead.");
            const bytes = Buffer.alloc(info.size);
            let offset = 0;
            while (offset < bytes.length) {
              const result = await file.read(bytes, offset, bytes.length - offset, offset);
              if (!result.bytesRead) throw new Error("The image changed while being copied.");
              offset += result.bytesRead;
            }
            const { autoOrient, format } = await sharp(bytes, {
              limitInputPixels: false,
            }).metadata();
            const pixels = autoOrient.width * autoOrient.height;
            const limit = readsAtReducedSize.has(format) ? maxSourcePixels : maxWholeDecodePixels;
            if (pixels > limit)
              throw new Error("This image is too large to copy. Drag its file instead.");
            const scale = Math.sqrt(maxCopyPixels / pixels);
            const scaled = scale < 1;
            // Decode in native workers, without fetching remote URLs or changing the original.
            const png = await sharp(bytes, { limitInputPixels: limit })
              .rotate()
              .resize(scaled ? { width: Math.floor(autoOrient.width * scale) } : {})
              .png()
              .toBuffer();
            return { png, scaled };
          } finally {
            await file.close();
          }
        } finally {
          copying = false;
        }
      }),
    file: (id: string) =>
      run(async () => {
        const found = await read(id);
        if (found.localAssetPath) return local(found);
        const text = found.body || found.sourceUrl || found.title || "";
        if (!text || Buffer.byteLength(text) > maxExportBytes)
          throw new Error("This item cannot be exported as a small text file.");
        directory ??= mkdtemp(join(temporaryDirectory, "inkling-drag-"));
        const name = (found.title || "Inkling item")
          .replace(/[<>:"/\\|?*\x00-\x1f]/gu, "_")
          .slice(0, 100);
        const extension = found.body && found.bodyFormat === "md" ? ".md" : ".txt";
        const path = join(await directory, `${sequence++}-${name}${extension}`);
        await writeFile(path, text, { mode: 0o600, flag: "wx" });
        exports.push(path);
        if (exports.length > 32) await rm(exports.shift()!, { force: true });
        return path;
      }),
    close() {
      closed = true;
      return (closing ??= (async () => {
        await Promise.allSettled(active);
        if (directory) await rm(await directory, { recursive: true, force: true });
      })().catch((error) => {
        closing = undefined;
        throw error;
      }));
    },
  };
}
