import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { Effect, Predicate } from "effect";
import type { StoredLibraryCard, StoredLibraryItemDetail } from "@inkling/contracts";
import { invalidInput } from "./errors.ts";

export type ItemRow = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  body: string | null;
  body_format: string | null;
  source_url: string | null;
  source_label: string | null;
  local_asset_path: string | null;
  thumbnail_path: string | null;
  ocr_text: string;
  metadata: string;
  created_at: number;
  updated_at: number;
  archived: number;
};

export type Metadata = Record<string, unknown>;

const itemColumns = `id, kind, title, description, source_url, source_label,
  local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
  archived, NULL AS body, 'md' AS body_format`;
export const detailColumns = itemColumns.replace(
  "NULL AS body, 'md' AS body_format",
  "body, body_format",
);
const cardMetadataFields = [
  "tags",
  "social",
  "imageUrls",
  "imageDimensions",
  "mediaWidth",
  "mediaHeight",
  "mediaAspectRatio",
  "pdfPageCount",
];

// String.prototype.trim removes this whole set; SQLite's trim(x) strips spaces only.
const jsTrimCharacters = `char(${[
  9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201,
  8202, 8232, 8233, 8239, 8287, 12288, 65279,
].join(",")})`;

// Card reads never need the article payload, so the projection keeps only the
// fields cardItem reads and reduces '$.html' to a marker it still recognizes.
// json_valid degrades bad metadata per row; json functions would otherwise
// error the whole list on one malformed row.
const cardColumnsFor = (p: string) => `${p}id, ${p}kind, ${p}title, ${p}description,
  ${p}source_url, ${p}source_label, ${p}local_asset_path, ${p}thumbnail_path,
  substr(trim(${p}ocr_text, ${jsTrimCharacters}), 1, 180) AS ocr_text,
  CASE WHEN json_valid(${p}metadata) AND json_type(${p}metadata) = 'object'
    THEN json_set(
      COALESCE((SELECT json_group_object(j.key, j.value) FROM json_each(${p}metadata) j
        WHERE j.key IN ('${[...cardMetadataFields, "palette"].join("','")}')), '{}'),
      '$.html',
      CASE WHEN json_type(${p}metadata, '$.html') = 'text'
        AND ltrim(json_extract(${p}metadata, '$.html'), ${jsTrimCharacters}) <> ''
        THEN 'x' ELSE NULL END)
    ELSE ${p}metadata END AS metadata,
  ${p}created_at, ${p}updated_at, ${p}archived, NULL AS body, 'md' AS body_format`;

export const cardColumns = cardColumnsFor("");
export const qualifiedCardColumns = cardColumnsFor("i.");

export function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export const isMetadata = (value: unknown): value is Metadata =>
  Predicate.isObject(value) && !Array.isArray(value);

export const parseObject = Effect.fnUntraced(function* (value: unknown, label = "metadata") {
  if (value == null) return {} as Metadata;
  if (!isMetadata(value)) return yield* invalidInput(`${label} must be a JSON object`);
  return value;
});

export function itemFromRow(row: ItemRow): StoredLibraryItemDetail {
  const metadata = parseJson<unknown>(row.metadata, {});
  const fields = isMetadata(metadata) ? metadata : {};
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    body: row.body ?? "",
    bodyFormat: row.body_format ?? "md",
    sourceUrl: row.source_url,
    sourceLabel: row.source_label,
    localAssetPath: row.local_asset_path,
    thumbnailPath: row.thumbnail_path,
    ocrText: row.ocr_text,
    metadata: fields,
    palette: Array.isArray(fields.palette) ? fields.palette : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived !== 0,
  };
}

export function cardItem(item: StoredLibraryItemDetail): StoredLibraryCard {
  const metadata = item.metadata;
  const cardMetadata: Metadata = {};
  for (const field of cardMetadataFields) {
    if (Object.hasOwn(metadata, field)) cardMetadata[field] = metadata[field];
  }
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    description: item.description,
    sourceUrl: item.sourceUrl,
    sourceLabel: item.sourceLabel,
    localAssetPath: item.localAssetPath,
    thumbnailPath: item.thumbnailPath,
    palette: Array.isArray(metadata.palette) ? metadata.palette : undefined,
    // Card queries deliver ocr_text trimmed and truncated; the slice caps it at
    // 180 UTF-16 units (SQLite substr counts code points, not units).
    ocrText: String(item.ocrText ?? "").slice(0, 180),
    metadata: cardMetadata,
    createdAt: item.createdAt,
    archived: item.archived,
    hasArticleContent: typeof metadata.html === "string" && Boolean(metadata.html.trim()),
  };
}

export const cardFromRow = (row: ItemRow) => cardItem(itemFromRow(row));

export function nonEmpty(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export const normalizeHttpUrl = Effect.fnUntraced(function* (value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    return yield* invalidInput("sourceUrl must be a valid HTTP or HTTPS URL");
  }
  if (!(url.protocol === "http:" || url.protocol === "https:") || !url.hostname) {
    return yield* invalidInput("sourceUrl must use HTTP or HTTPS and include a host");
  }
  url.hash = "";
  return url.toString();
});

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?>|<hr\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+)/gm, " ")
    .replace(/[*_~]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replace(/ \./g, ".")
    .replace(/ ,/g, ",")
    .replace(/ ;/g, ";")
    .replace(/ :/g, ":")
    .replace(/ !/g, "!")
    .replace(/ \?/g, "?");
}

export const validateItemId = Effect.fnUntraced(function* (id: unknown) {
  const value = String(id ?? "").trim();
  if (value.length < 1 || value.length > 128) {
    return yield* invalidInput("item id must contain 1 to 128 characters");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    return yield* invalidInput("item id contains unsupported characters");
  }
  return value;
});

export const isSafeItemId = (id: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(id);

export function clampLimit(value: unknown, fallback: number, maximum: number) {
  const limit = Number(value);
  return Number.isFinite(limit) ? Math.min(maximum, Math.max(1, Math.trunc(limit))) : fallback;
}

export function isInside(candidate: string, root: string) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
  );
}

export async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export const isMissing = (error: unknown) =>
  Predicate.hasProperty(error, "code") && error.code === "ENOENT";

// A statement run with `.raw` reports how many rows it touched.
export const changes = (result: unknown) => (result as { changes: number }).changes;
