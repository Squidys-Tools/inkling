import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { Effect, Predicate } from "effect";
import type { StoredLibraryCard, StoredLibraryItemDetail } from "@inkling/contracts";
import { invalidInput } from "./errors.ts";
import { jsTrimCharacters } from "./schema.ts";

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
  content_html?: string | null;
  content_text?: string | null;
  content_extracted_text?: string | null;
};

export type Metadata = Record<string, unknown>;

// The heavy article keys live in item_content, not items.metadata. Writes run
// through splitItemMetadata so the keys can never creep back into the column,
// and detail reads merge them back so callers see the same shape as before.
export type ItemContent = {
  html: string | null;
  text: string | null;
  extracted_text: string | null;
};

export function splitItemMetadata(metadata: Metadata): {
  metadata: Metadata;
  content: ItemContent;
} {
  const { html, text, extractedText, ...rest } = metadata;
  return {
    metadata: rest,
    content: {
      html: nonEmpty(html),
      text: nonEmpty(text),
      extracted_text: nonEmpty(extractedText),
    },
  };
}

const detailColumnsFor = (p: string) => `${p}id, ${p}kind, ${p}title, ${p}description,
  ${p}source_url, ${p}source_label, ${p}local_asset_path, ${p}thumbnail_path, ${p}ocr_text,
  ${p}metadata, ${p}created_at, ${p}updated_at, ${p}archived, ${p}body, ${p}body_format`;
export const qualifiedDetailColumns = detailColumnsFor("i.");
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

// Card reads never need the article payload, so the projection reduces html
// presence to a marker: IS NOT NULL reads only the item_content record header.
// The metadata fallback covers rows written before schema 9; json_valid
// degrades bad metadata per row instead of erroring the whole list.
const cardColumnsFor = (p: string) => `${p}id, ${p}kind, ${p}title, ${p}description,
  ${p}source_url, ${p}source_label, ${p}local_asset_path, ${p}thumbnail_path,
  substr(trim(${p}ocr_text, ${jsTrimCharacters}), 1, 180) AS ocr_text,
  CASE WHEN json_valid(${p}metadata) AND json_type(${p}metadata) = 'object'
    THEN json_set(
      COALESCE((SELECT json_group_object(j.key, j.value) FROM json_each(${p}metadata) j
        WHERE j.key IN ('${[...cardMetadataFields, "palette"].join("','")}')), '{}'),
      '$.html',
      CASE WHEN EXISTS(SELECT 1 FROM item_content c WHERE c.item_id = ${p}id
        AND c.html IS NOT NULL)
        OR (json_type(${p}metadata, '$.html') = 'text'
          AND ltrim(json_extract(${p}metadata, '$.html'), ${jsTrimCharacters}) <> '')
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
  if (row.content_html != null) fields.html = row.content_html;
  if (row.content_text != null) fields.text = row.content_text;
  if (row.content_extracted_text != null) fields.extractedText = row.content_extracted_text;
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
