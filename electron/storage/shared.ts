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

export const itemColumns = `id, kind, title, description, source_url, source_label,
  local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
  archived, NULL AS body, 'md' AS body_format`;
export const detailColumns = itemColumns.replace(
  "NULL AS body, 'md' AS body_format",
  "body, body_format",
);
export const qualifiedItemColumns = `i.id, i.kind, i.title, i.description, i.source_url, i.source_label,
  i.local_asset_path, i.thumbnail_path, i.ocr_text, i.metadata, i.created_at, i.updated_at,
  i.archived, NULL AS body, 'md' AS body_format`;
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
    ocrText: String(item.ocrText ?? "")
      .trim()
      .slice(0, 180),
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

export const isSafeItemId = (id: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(id);

export function clampLimit(limit: number, fallback: number, maximum: number) {
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
