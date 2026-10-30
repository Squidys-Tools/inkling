import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { openTestLibrary } from "./storage/test-library.ts";

type Library = Awaited<ReturnType<typeof openTestLibrary>>;

// Search-fence fixtures need stable IDs and replaced references; capture now
// always creates a fresh ID, so these states are seeded directly, not through it.
export async function seedSearchFile(
  library: Library,
  root: string,
  input: { id?: string; fileName: string; kind: "image" | "pdf"; bytes: Uint8Array },
) {
  const id = input.id ?? randomUUID();
  const assetPath = `assets/items/${id}/${randomUUID()}-${input.fileName}`;
  const path = join(root, assetPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, input.bytes);
  const now = Date.now();
  library.db
    .prepare(`INSERT INTO items
    (id, kind, title, local_asset_path, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title,
      local_asset_path=excluded.local_asset_path, metadata=excluded.metadata,
      thumbnail_path=NULL, ocr_text='', search_revision=items.search_revision+1,
      updated_at=excluded.updated_at`)
    .run(
      id,
      input.kind,
      input.fileName,
      assetPath,
      JSON.stringify({ byteLength: input.bytes.byteLength }),
      now,
      now,
    );
  const item = await library.getItem(id);
  if (!item) throw new Error("Search fixture was not inserted");
  return item;
}
