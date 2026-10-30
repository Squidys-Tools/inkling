import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function seedLibrary({ harnessRoot, appRoot, library, database, items }) {
  const { personalSeedItems } = await import(
    pathToFileURL(join(harnessRoot, "src/seedPersonal.ts"))
  );
  const { openTestLibrary } = await import(
    pathToFileURL(join(appRoot, "electron/storage/test-library.ts"))
  );
  const require = createRequire(join(harnessRoot, "package.json"));
  const sharp = require("sharp");
  const images = [];
  for (const item of personalSeedItems.filter((item) => item.image?.startsWith("/seed-demo/"))) {
    const path = join(harnessRoot, "public", item.image);
    const bytes = readFileSync(path);
    const metadata = await sharp(bytes).metadata();
    const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
    const thumbnail = await sharp(bytes)
      .rotate()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    images.push({
      item,
      path,
      width: rotated ? metadata.height : metadata.width,
      height: rotated ? metadata.width : metadata.height,
      thumbnail,
      sourceHash: hash(bytes),
      thumbnailHash: hash(thumbnail),
    });
  }
  assert(images.length > 0, "No committed demo images found");
  const pdfObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];
  let pdf = "%PDF-1.4\n";
  const pdfOffsets = [0];
  for (const [index, object] of pdfObjects.entries()) {
    pdfOffsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 4\n0000000000 65535 f \n${pdfOffsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const pattern = [
    "image",
    "image",
    "article-image",
    "note",
    "image",
    "quote",
    "pdf",
    "article",
    "image",
    "video",
    "file",
    "post",
    "image",
    "article-image",
    "note",
    "image",
  ];
  const storage = await openTestLibrary(database);
  const manifest = [];
  let listPayload;
  try {
    const insert = storage.db.prepare(`INSERT INTO items
      (id, kind, title, description, body, source_label, local_asset_path, thumbnail_path,
       metadata, created_at, updated_at, ocr_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    storage.db.exec("BEGIN IMMEDIATE");
    for (let index = 0; index < items; index += 1) {
      const variant = pattern[index % pattern.length];
      const image = images[index % images.length];
      const id = `bench-${String(index).padStart(6, "0")}`;
      const directory = join(library, "assets/items", id);
      mkdirSync(directory, { recursive: true });
      const hasThumbnail = ["image", "article-image", "pdf", "video"].includes(variant);
      const thumbnail = hasThumbnail ? `assets/items/${id}/thumbnail.jpg` : null;
      if (thumbnail) writeFileSync(join(library, thumbnail), image.thumbnail);
      let localAsset = null;
      if (variant === "image") {
        localAsset = `assets/items/${id}/${basename(image.path)}`;
        copyFileSync(image.path, join(library, localAsset));
      } else if (variant === "video") {
        localAsset = `assets/items/${id}/clip.mp4`;
        copyFileSync(
          join(harnessRoot, "public/seed-demo/saved-clip.mp4"),
          join(library, localAsset),
        );
      } else if (variant === "file") {
        localAsset = `assets/items/${id}/reference.txt`;
        writeFileSync(join(library, localAsset), "A local benchmark reference file.\n");
      } else if (variant === "pdf") {
        localAsset = `assets/items/${id}/reference.pdf`;
        writeFileSync(join(library, localAsset), pdf);
      }
      const kind = variant === "article-image" ? "article" : variant;
      const title = `${image.item.title} ${String(index).padStart(4, "0")}`;
      const description = image.item.description || "A saved reference from the demo library.";
      const metadata = {
        tags: image.item.tags,
        ...(hasThumbnail ? { mediaWidth: image.width, mediaHeight: image.height } : {}),
        ...(kind === "pdf" ? { pdfPageCount: 1 } : {}),
        ...(kind === "article"
          ? { html: `<p>${description}</p>`.repeat(40), author: "Demo author" }
          : {}),
      };
      const body =
        kind === "note" ? `# ${title}\n\n${description}\n\nKeep this idea for later.` : "";
      const timestamp = 1_760_000_000_000 - index * 60_000;
      insert.run(
        id,
        kind,
        title,
        description,
        body,
        "Demo library",
        localAsset,
        thumbnail,
        JSON.stringify(metadata),
        timestamp,
        timestamp,
        ["image", "pdf"].includes(kind) ? `Demo extracted text for ${title}` : "",
      );
      manifest.push({
        id,
        variant,
        title,
        metadata,
        sourceHash: image.sourceHash,
        thumbnailHash: hasThumbnail ? image.thumbnailHash : null,
      });
    }
    storage.db.exec("COMMIT");
    storage.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const listItems = await storage.listActiveItems();
    listPayload = {
      itemCount: listItems.length,
      jsonBytes: Buffer.byteLength(JSON.stringify(listItems)),
    };
  } finally {
    await storage.close();
  }
  return {
    sha256: hash(JSON.stringify(manifest)),
    seedSourceSha256: hash(readFileSync(join(harnessRoot, "src/seedPersonal.ts"))),
    items,
    variants: Object.fromEntries(
      pattern.map((variant) => [
        variant,
        manifest.filter((entry) => entry.variant === variant).length,
      ]),
    ),
    uniqueDemoImages: images.length,
    thumbnail:
      "JPEG quality 80, auto-oriented, inside 512x512, no enlargement; metadata uses original oriented pixel dimensions",
    embeddings:
      "None. Raw inserts enqueue no work; stale-image migration only selects existing stale vectors. Image/PDF OCR text is preseeded to prevent lazy OCR on detail open. Every PDF has a thumbnail, so idle PDF backfill has no candidate.",
    sharpVersion: sharp.versions.sharp,
    listPayload,
  };
}

export function databaseProof(database, items) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const itemCount = db.prepare("SELECT count(*) AS count FROM items").get().count;
    const jobs = db.prepare("SELECT status, count(*) AS count FROM jobs GROUP BY status").all();
    assert(itemCount === items, `Database has ${itemCount} items, expected ${items}`);
    assert(
      jobs.length === 0,
      `Background jobs appeared: ${JSON.stringify(db.prepare("SELECT item_id, kind, status FROM jobs").all())}`,
    );
    return { itemCount, jobCount: 0, jobs };
  } finally {
    db.close();
  }
}
