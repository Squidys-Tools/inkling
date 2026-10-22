import { randomUUID } from "node:crypto";
import { escapeFtsQuery, sqlLikePattern } from "./search.mjs";
import {
  cardItem,
  clampLimit,
  itemFromRow,
  nonEmpty,
  nowMillis,
  parseJson,
  qualifiedItemColumns,
} from "./shared.mjs";

function spaceFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    query: parseJson(row.query, {}),
    kind: row.kind,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.kind === "regular" && row.item_count != null
      ? { itemCount: Number(row.item_count) }
      : {}),
  };
}

export function validateSmartQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query))
    throw new Error("invalid storage input: Space query must be an object");
  const clean = (value, field, max) => {
    if (value == null) return undefined;
    if (typeof value !== "string") throw new Error(`invalid storage input: ${field} must be text`);
    const trimmed = value.trim();
    if (Buffer.byteLength(trimmed) > max)
      throw new Error(`invalid storage input: ${field} must be at most ${max} characters`);
    return trimmed || undefined;
  };
  return {
    text: clean(query.text, "text", 512),
    kind: clean(query.kind, "kind", 32),
    tag: clean(query.tag, "tag", 64),
  };
}

function normalizeSpaceName(name) {
  const normalized = String(name ?? "").trim();
  if (!normalized) throw new Error("invalid storage input: space name cannot be empty");
  if (Buffer.byteLength(normalized) > 80)
    throw new Error("invalid storage input: space name must be at most 80 characters");
  return normalized;
}

export function normalizeSpaceColor(color) {
  const normalized = nonEmpty(color)?.toLowerCase();
  return ["blue", "orange", "green", "pink", "purple", "yellow"].includes(normalized)
    ? normalized
    : "blue";
}

export const spaceMethods = {
  listSpaces() {
    return this.db
      .prepare(`SELECT spaces.*, membership.item_count FROM spaces
        LEFT JOIN (
          SELECT space_id, COUNT(*) AS item_count FROM space_items GROUP BY space_id
        ) membership ON membership.space_id = spaces.id
        ORDER BY spaces.position, spaces.created_at`)
      .all()
      .map(spaceFromRow);
  },

  getSpace(id) {
    return spaceFromRow(this.db.prepare("SELECT * FROM spaces WHERE id = ?").get(id));
  },

  createSpace(input = {}) {
    const name = normalizeSpaceName(input.name);
    const kind = input.kind ?? "smart";
    if (kind !== "smart" && kind !== "regular")
      throw new Error("invalid storage input: Space kind must be smart or regular");
    const query = kind === "regular" ? {} : validateSmartQuery(input.query);
    const id = randomUUID();
    const now = nowMillis();
    const position = this.db
      .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM spaces")
      .get().next;
    this.db
      .prepare(
        "INSERT INTO spaces (id, name, color, query, kind, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        name,
        normalizeSpaceColor(input.color),
        JSON.stringify(query),
        kind,
        position,
        now,
        now,
      );
    return this.getSpace(id);
  },

  updateSpace(input = {}) {
    if (input.query != null && this.getSpace(input.id)?.kind === "regular") {
      throw new Error("invalid storage input: a Regular Space has no search query to change");
    }
    if (input.query != null && !this.getSpace(input.id))
      throw new Error(`space not found: ${input.id}`);
    const query = input.query == null ? null : JSON.stringify(validateSmartQuery(input.query));
    const updated = this.db
      .prepare(`UPDATE spaces SET name = COALESCE(?, name), color = COALESCE(?, color),
      query = COALESCE(?, query), position = COALESCE(?, position), updated_at = ? WHERE id = ?`)
      .run(
        input.name == null ? null : normalizeSpaceName(input.name),
        input.color == null ? null : normalizeSpaceColor(input.color),
        query,
        input.position ?? null,
        nowMillis(),
        input.id,
      ).changes;
    if (!updated) throw new Error(`space not found: ${input.id}`);
    return this.getSpace(input.id);
  },

  deleteSpace(id) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM space_items WHERE space_id = ?").run(id);
      const deleted = this.db.prepare("DELETE FROM spaces WHERE id = ?").run(id).changes;
      if (!deleted) throw new Error(`space not found: ${id}`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  },

  swapSpacePositions(firstId, secondId) {
    if (firstId === secondId) {
      if (!this.getSpace(firstId)) throw new Error(`space not found: ${firstId}`);
      return this.listSpaces();
    }
    const rows = this.db
      .prepare("SELECT id, position FROM spaces WHERE id IN (?, ?)")
      .all(firstId, secondId);
    if (rows.length !== 2) {
      const missing = rows.some((row) => row.id === firstId) ? secondId : firstId;
      throw new Error(`space not found: ${missing}`);
    }
    const firstPosition = rows.find((row) => row.id === firstId).position;
    const secondPosition = rows.find((row) => row.id === secondId).position;
    this.db
      .prepare(`UPDATE spaces SET position = CASE id WHEN ? THEN ? WHEN ? THEN ? ELSE position END,
      updated_at = ? WHERE id IN (?, ?)`)
      .run(firstId, secondPosition, secondId, firstPosition, nowMillis(), firstId, secondId);
    return this.listSpaces();
  },

  listSpaceItems(id, limit = 100, queryVector = null) {
    const space = this.getSpace(id);
    if (!space) throw new Error(`space not found: ${id}`);
    const cap = clampLimit(limit, 100, 200);
    if (space.kind === "regular") {
      const rows = this.db
        .prepare(`SELECT ${qualifiedItemColumns} FROM space_items s JOIN items i ON i.id = s.item_id
        WHERE s.space_id = ? AND i.archived = 0 ORDER BY s.added_at DESC, i.id LIMIT ?`)
        .all(id, cap);
      return rows.map(itemFromRow).map(cardItem);
    }
    const query = space.query;
    const text = nonEmpty(query.text);
    const clauses = ["i.archived = 0"];
    const values = [];
    let from = "items i";
    let rankedCandidates = null;
    if (text && queryVector?.length) {
      rankedCandidates = this.searchItems(text, 200, queryVector);
      if (!rankedCandidates.length) return [];
      clauses.push(`i.id IN (${rankedCandidates.map(() => "?").join(", ")})`);
      values.push(...rankedCandidates.map((item) => item.id));
    } else if (text && this.fts5Enabled) {
      const match = escapeFtsQuery(text);
      if (!match) return [];
      from = "items_fts f JOIN items i ON i.id = f.item_id";
      clauses.push("items_fts MATCH ?");
      values.push(match);
    } else if (text) {
      const pattern = sqlLikePattern(text);
      clauses.push(`(i.title COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.description COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.body COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.source_label COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.ocr_text COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.metadata COLLATE NOCASE LIKE ? ESCAPE char(92))`);
      values.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }
    if (nonEmpty(query.tag)) {
      clauses.push(
        "EXISTS (SELECT 1 FROM json_each(i.metadata, '$.tags') WHERE type = 'text' AND inkling_unicode_lower(value) = ?)",
      );
      values.push(query.tag.trim().toLowerCase());
    }
    if (nonEmpty(query.kind)) {
      if (query.kind.trim().toLowerCase() === "article") {
        clauses.push("i.kind IN ('url', 'article')");
      } else {
        clauses.push("lower(i.kind) = lower(?)");
        values.push(query.kind.trim());
      }
    }
    const rows = this.db
      .prepare(`SELECT ${qualifiedItemColumns} FROM ${from} WHERE ${clauses.join(" AND ")}
      ORDER BY i.updated_at DESC, i.created_at DESC LIMIT ?`)
      .all(...values, cap);
    if (rankedCandidates) {
      const matchingIds = new Set(rows.map((row) => row.id));
      return rankedCandidates.filter((item) => matchingIds.has(item.id)).slice(0, cap);
    }
    return rows.map(itemFromRow).map(cardItem);
  },

  addSpaceItem(spaceId, itemId) {
    const space = this.getSpace(spaceId);
    if (!space) throw new Error(`space not found: ${spaceId}`);
    if (space.kind !== "regular")
      throw new Error("invalid storage input: items can only be added to a Regular Space");
    if (!this.getItem(itemId)) throw new Error(`item not found: ${itemId}`);
    this.db
      .prepare("INSERT OR IGNORE INTO space_items (space_id, item_id, added_at) VALUES (?, ?, ?)")
      .run(spaceId, itemId, nowMillis());
  },

  removeSpaceItem(spaceId, itemId) {
    if (!this.getSpace(spaceId)) throw new Error(`space not found: ${spaceId}`);
    this.db
      .prepare("DELETE FROM space_items WHERE space_id = ? AND item_id = ?")
      .run(spaceId, itemId);
  },

  listItemSpaces(itemId) {
    return this.db
      .prepare(`SELECT s.id FROM space_items m JOIN spaces s ON s.id = m.space_id
      WHERE m.item_id = ? ORDER BY s.position, s.created_at`)
      .all(itemId)
      .map((row) => row.id);
  },
};
