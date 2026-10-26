import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

export const itemColumns = `id, kind, title, description, source_url, source_label,
  local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
  archived, NULL AS body, 'md' AS body_format`;
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

export function nowMillis() {
  return Date.now();
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function parseObject(value, label = "metadata") {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

export function itemFromRow(row) {
  if (!row) return null;
  const metadata = parseJson(row.metadata, {});
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    body: row.body,
    bodyFormat: row.body_format,
    sourceUrl: row.source_url,
    sourceLabel: row.source_label,
    localAssetPath: row.local_asset_path,
    thumbnailPath: row.thumbnail_path,
    ocrText: row.ocr_text,
    metadata,
    palette: Array.isArray(metadata.palette) ? metadata.palette : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived !== 0,
  };
}

export function cardItem(item) {
  const metadata =
    item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? item.metadata
      : {};
  const cardMetadata = {};
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

export function nonEmpty(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeHttpUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("invalid storage input: sourceUrl must be a valid HTTP or HTTPS URL");
  }
  if (!(url.protocol === "http:" || url.protocol === "https:") || !url.hostname) {
    throw new Error("invalid storage input: sourceUrl must use HTTP or HTTPS and include a host");
  }
  url.hash = "";
  return url.toString();
}

export function markdownToPlainText(markdown) {
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

export function validateItemId(id) {
  const value = String(id ?? "").trim();
  if (value.length < 1 || value.length > 128) {
    throw new Error("invalid storage input: item id must contain 1 to 128 characters");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error("invalid storage input: item id contains unsupported characters");
  }
  return value;
}

export function clampLimit(value, fallback, maximum) {
  const limit = Number(value);
  return Number.isFinite(limit) ? Math.min(maximum, Math.max(1, Math.trunc(limit))) : fallback;
}

export function itemSelect(
  db,
  where,
  params = [],
  order = "updated_at DESC, created_at DESC",
  limit,
) {
  const limitClause = limit == null ? "" : " LIMIT ?";
  return db
    .prepare(`SELECT ${itemColumns} FROM items WHERE ${where} ORDER BY ${order}${limitClause}`)
    .all(...params, ...(limit == null ? [] : [limit]))
    .map(itemFromRow)
    .map(cardItem);
}

export function isInside(candidate, root) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
  );
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
