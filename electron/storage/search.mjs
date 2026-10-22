import { IMAGE_MODEL, TEXT_MODEL } from "../embedding-contract.mjs";
import {
  clampLimit,
  itemFromRow,
  cardItem,
  itemSelect,
  itemColumns,
  nowMillis,
  qualifiedItemColumns,
} from "./shared.mjs";

const semanticMatchFloor = 0.55;

export function escapeFtsQuery(query) {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', "")}"`)
    .filter((token) => token !== '""')
    .join(" ");
}

function decodeFloatVector(blob, dimension) {
  if (!blob || blob.byteLength !== dimension * 4) return null;
  const bytes = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  return Array.from({ length: dimension }, (_, index) => bytes.readFloatLE(index * 4));
}

function dotProduct(left, right) {
  if (left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

export function sqlLikePattern(value) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export const searchMethods = {
  storeEmbedding(itemId, kind, model, bytes, dimension) {
    if (kind !== "text" && kind !== "image") {
      throw new Error("invalid storage input: embedding kind must be text or image");
    }
    const vector = Buffer.from(bytes);
    if (!Number.isInteger(dimension) || dimension < 1 || vector.length !== dimension * 4) {
      throw new Error("invalid storage input: embedding vector dimension does not match its bytes");
    }
    this.db
      .prepare(`INSERT INTO item_embeddings (item_id, kind, model, dimension, vector, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(item_id, kind) DO UPDATE SET model = excluded.model,
      dimension = excluded.dimension, vector = excluded.vector, created_at = excluded.created_at`)
      .run(itemId, kind, String(model), dimension, vector, nowMillis());
  },

  searchItems(query, limit = 100, queryVector = null) {
    const search = String(query ?? "").trim();
    const cap = clampLimit(limit, 100, 200);
    if (!search)
      return itemSelect(this.db, "archived = 0", [], "updated_at DESC, created_at DESC", cap);
    let rows;
    if (this.fts5Enabled) {
      const match = escapeFtsQuery(search);
      rows = match
        ? this.db
            .prepare(`SELECT ${qualifiedItemColumns} FROM items_fts f JOIN items i ON i.id = f.item_id
          WHERE i.archived = 0 AND items_fts MATCH ? ORDER BY i.updated_at DESC, i.created_at DESC LIMIT ?`)
            .all(match, cap)
        : [];
    } else {
      const pattern = sqlLikePattern(search);
      rows = this.db
        .prepare(`SELECT ${itemColumns} FROM items WHERE archived = 0
        AND (title COLLATE NOCASE LIKE ? ESCAPE char(92) OR description COLLATE NOCASE LIKE ? ESCAPE char(92)
          OR body COLLATE NOCASE LIKE ? ESCAPE char(92) OR source_label COLLATE NOCASE LIKE ? ESCAPE char(92)
          OR ocr_text COLLATE NOCASE LIKE ? ESCAPE char(92) OR metadata COLLATE NOCASE LIKE ? ESCAPE char(92))
        ORDER BY updated_at DESC, created_at DESC LIMIT ?`)
        .all(pattern, pattern, pattern, pattern, pattern, pattern, cap);
    }
    const lexicalItems = rows.map(itemFromRow);
    if (!queryVector?.length) return lexicalItems.map(cardItem);

    const ranked = new Map(lexicalItems.map((item) => [item.id, { item, score: 2 }]));
    const candidates = this.db
      .prepare(`SELECT ${qualifiedItemColumns}, e.dimension AS embedding_dimension,
        e.vector AS embedding_vector FROM item_embeddings e JOIN items i ON i.id = e.item_id
        WHERE i.archived = 0 AND ((e.kind = 'text' AND e.model = ?)
          OR (e.kind = 'image' AND e.model = ?))`)
      .all(TEXT_MODEL, IMAGE_MODEL);
    for (const row of candidates) {
      const vector = decodeFloatVector(row.embedding_vector, row.embedding_dimension);
      if (!vector || vector.length !== queryVector.length) continue;
      const item = itemFromRow(row);
      const similarity = dotProduct(queryVector, vector);
      const current = ranked.get(item.id);
      if (similarity < semanticMatchFloor && !current) continue;
      const score = current ? 2 + Math.max(similarity, 0) : similarity;
      if (current) current.score = Math.max(current.score, score);
      else ranked.set(item.id, { item, score });
    }

    return [...ranked.values()]
      .sort((left, right) => right.score - left.score || right.item.updatedAt - left.item.updatedAt)
      .slice(0, cap)
      .map(({ item }) => cardItem(item));
  },

  searchSimilar(itemId, kind, limit = 12) {
    const model = kind === "image" ? IMAGE_MODEL : TEXT_MODEL;
    const source = this.db
      .prepare(
        "SELECT dimension, vector FROM item_embeddings WHERE item_id = ? AND kind = ? AND model = ?",
      )
      .get(itemId, kind, model);
    if (!source) return [];
    const sourceVector = decodeFloatVector(source.vector, source.dimension);
    if (!sourceVector)
      throw new Error(
        `invalid storage input: stored ${kind} embedding dimension does not match its vector`,
      );
    const candidates = this.db
      .prepare(`SELECT ${qualifiedItemColumns}, e.dimension, e.vector FROM item_embeddings e
      JOIN items i ON i.id = e.item_id WHERE i.archived = 0 AND i.id != ?
      AND ((? = 'image' AND i.kind = 'image') OR (? = 'text' AND i.kind IN ('article', 'url', 'note', 'quote')))
      AND e.kind = ? AND e.model = ?`)
      .all(itemId, kind, kind, kind, model);
    return candidates
      .map((row) => ({
        item: itemFromRow(row),
        vector: decodeFloatVector(row.vector, row.dimension),
      }))
      .filter(({ vector }) => vector && vector.length === sourceVector.length)
      .map(({ item, vector }) => ({ item, score: dotProduct(sourceVector, vector) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, clampLimit(limit, 12, 50))
      .map(({ item }) => cardItem(item));
  },
};
