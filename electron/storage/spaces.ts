import { randomUUID } from "node:crypto";
import { Effect } from "effect";
import type {
  CreateSpaceInput,
  SmartSpaceQuery,
  SpaceColor,
  StoredSpace,
  UpdateSpaceInput,
} from "@inkling/contracts";
import type { Fragment } from "effect/sql/Statement";
import { readItem, type StorageContext } from "./context.ts";
import { invalidInput, itemNotFound, spaceNotFound } from "./errors.ts";
import type { QueryVector } from "./search.ts";
import type { makeSearch } from "./search.ts";
import {
  cardFromRow,
  changes,
  clampLimit,
  type ItemRow,
  isMetadata,
  nonEmpty,
  parseJson,
  qualifiedItemColumns,
} from "./shared.ts";

type SpaceRow = {
  id: string;
  name: string;
  color: SpaceColor;
  query: string;
  kind: StoredSpace["kind"];
  position: number;
  created_at: number;
  updated_at: number;
  item_count?: number | null;
};

const spaceColors = ["blue", "orange", "green", "pink", "purple", "yellow"] as const;

// Older sidebar-created Smart Spaces saved {} when no search was active,
// accidentally becoming Everything. Evaluate their name as the missing intent,
// without rewriting stored/exported filters or changing kind/tag-only Spaces.
export function smartSpaceText(space: Pick<StoredSpace, "kind" | "name" | "query">) {
  if (space.kind !== "smart") return "";
  return (
    nonEmpty(space.query.text) ??
    (!nonEmpty(space.query.kind) && !nonEmpty(space.query.tag) ? space.name.trim() : "")
  );
}

function spaceFromRow(row: SpaceRow): StoredSpace {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    query: parseJson<SmartSpaceQuery>(row.query, {}),
    kind: row.kind,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.kind === "regular" && row.item_count != null
      ? { itemCount: Number(row.item_count) }
      : {}),
  };
}

export const validateSmartQuery = Effect.fnUntraced(function* (query: unknown = {}) {
  if (!isMetadata(query)) return yield* invalidInput("Space query must be an object");
  const clean = Effect.fnUntraced(function* (value: unknown, field: string, max: number) {
    if (value == null) return undefined;
    if (typeof value !== "string") return yield* invalidInput(`${field} must be text`);
    const trimmed = value.trim();
    if (Buffer.byteLength(trimmed) > max)
      return yield* invalidInput(`${field} must be at most ${max} characters`);
    return trimmed || undefined;
  });
  return {
    text: yield* clean(query.text, "text", 512),
    kind: yield* clean(query.kind, "kind", 32),
    tag: yield* clean(query.tag, "tag", 64),
  };
});

const normalizeSpaceName = Effect.fnUntraced(function* (name: unknown) {
  const normalized = String(name ?? "").trim();
  if (!normalized) return yield* invalidInput("space name cannot be empty");
  if (Buffer.byteLength(normalized) > 80)
    return yield* invalidInput("space name must be at most 80 characters");
  return normalized;
});

export function normalizeSpaceColor(color: unknown): SpaceColor {
  const normalized = nonEmpty(color)?.toLowerCase();
  return spaceColors.find((value) => value === normalized) ?? "blue";
}

export function makeSpaces(ctx: StorageContext, search: ReturnType<typeof makeSearch>) {
  const { sql } = ctx;

  const listSpaces = () =>
    sql<SpaceRow>`SELECT spaces.*, membership.item_count FROM spaces
      LEFT JOIN (
        SELECT space_id, COUNT(*) AS item_count FROM space_items GROUP BY space_id
      ) membership ON membership.space_id = spaces.id
      ORDER BY spaces.position, spaces.created_at`.pipe(
      Effect.map((rows) => rows.map(spaceFromRow)),
    );

  const getSpace = (id: string) =>
    sql<SpaceRow>`SELECT * FROM spaces WHERE id = ${id}`.pipe(
      Effect.map(([row]) => (row ? spaceFromRow(row) : null)),
    );
  const writtenSpace = (id: string) =>
    getSpace(id).pipe(
      Effect.flatMap((space) => (space ? Effect.succeed(space) : Effect.fail(spaceNotFound(id)))),
    );

  const createSpace = Effect.fnUntraced(function* (input: CreateSpaceInput) {
    const name = yield* normalizeSpaceName(input.name);
    const kind = input.kind ?? "smart";
    if (kind !== "smart" && kind !== "regular")
      return yield* invalidInput("Space kind must be smart or regular");
    const query = kind === "regular" ? {} : yield* validateSmartQuery(input.query);
    const id = randomUUID();
    const now = Date.now();
    const [{ next }] = yield* sql<{ next: number }>`SELECT COALESCE(MAX(position), 0) + 1 AS next
      FROM spaces`;
    yield* sql`INSERT INTO spaces (id, name, color, query, kind, position, created_at, updated_at)
      VALUES (${id}, ${name}, ${normalizeSpaceColor(input.color)}, ${JSON.stringify(query)}, ${kind},
      ${next}, ${now}, ${now})`;
    return yield* writtenSpace(id);
  });

  const updateSpace = Effect.fnUntraced(function* (input: UpdateSpaceInput) {
    if (input.query != null) {
      const space = yield* getSpace(input.id);
      if (space?.kind === "regular")
        return yield* invalidInput("a Regular Space has no search query to change");
      if (!space) return yield* spaceNotFound(input.id);
    }
    const query =
      input.query == null ? null : JSON.stringify(yield* validateSmartQuery(input.query));
    const name = input.name == null ? null : yield* normalizeSpaceName(input.name);
    const color = input.color == null ? null : normalizeSpaceColor(input.color);
    const updated = yield* sql`UPDATE spaces SET name = COALESCE(${name}, name),
      color = COALESCE(${color}, color), query = COALESCE(${query}, query),
      position = COALESCE(${input.position ?? null}, position), updated_at = ${Date.now()}
      WHERE id = ${input.id}`.raw;
    if (!changes(updated)) return yield* spaceNotFound(input.id);
    return yield* writtenSpace(input.id);
  });

  const deleteSpace = (id: string) =>
    sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`DELETE FROM space_items WHERE space_id = ${id}`;
        const deleted = yield* sql`DELETE FROM spaces WHERE id = ${id}`.raw;
        if (!changes(deleted)) return yield* spaceNotFound(id);
      }),
    );

  const swapSpacePositions = Effect.fnUntraced(function* (firstId: string, secondId: string) {
    if (firstId === secondId) {
      if (!(yield* getSpace(firstId))) return yield* spaceNotFound(firstId);
      return yield* listSpaces();
    }
    const rows = yield* sql<{ id: string; position: number }>`SELECT id, position FROM spaces
      WHERE id IN (${firstId}, ${secondId})`;
    const first = rows.find((row) => row.id === firstId);
    const second = rows.find((row) => row.id === secondId);
    if (!first) return yield* spaceNotFound(firstId);
    if (!second) return yield* spaceNotFound(secondId);
    yield* sql`UPDATE spaces SET position = CASE id WHEN ${firstId} THEN ${second.position}
      WHEN ${secondId} THEN ${first.position} ELSE position END, updated_at = ${Date.now()}
      WHERE id IN (${firstId}, ${secondId})`;
    return yield* listSpaces();
  });

  // SQLite's lower() folds ASCII only, so tags compare in JavaScript and the
  // matching ids go back in as one JSON value.
  const taggedItemIds = (tag: string) =>
    sql<{ id: string; tag: string }>`SELECT i.id, t.value AS tag
      FROM items i, json_each(i.metadata, '$.tags') t
      WHERE i.archived = 0 AND t.type = 'text'`.pipe(
      Effect.map((rows) => {
        const wanted = tag.toLowerCase();
        return JSON.stringify([
          ...new Set(rows.filter((row) => row.tag.toLowerCase() === wanted).map((row) => row.id)),
        ]);
      }),
    );

  const listSpaceItems = Effect.fnUntraced(function* (
    id: string,
    limit: unknown = 100,
    queryVector: QueryVector = null,
  ) {
    const space = yield* getSpace(id);
    if (!space) return yield* spaceNotFound(id);
    const cap = clampLimit(limit, 100, 200);
    if (space.kind === "regular") {
      const rows = yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)}
        FROM space_items s JOIN items i ON i.id = s.item_id
        WHERE s.space_id = ${id} AND i.archived = 0 ORDER BY s.added_at DESC, i.id LIMIT ${cap}`;
      return rows.map(cardFromRow);
    }
    const query = space.query;
    const text = smartSpaceText(space);
    const clauses: Fragment[] = [sql`i.archived = 0`];
    const from = sql.literal("items i");
    const tag = nonEmpty(query.tag);
    if (tag) clauses.push(sql`i.id IN (SELECT value FROM json_each(${yield* taggedItemIds(tag)}))`);
    const kind = nonEmpty(query.kind);
    if (kind) {
      clauses.push(
        kind.toLowerCase() === "article"
          ? sql`i.kind IN ('url', 'article')`
          : sql`lower(i.kind) = lower(${kind})`,
      );
    }
    // Every lane is scoped before its cap, including offline lexical search.
    if (text) return yield* search.searchItems(text, cap, queryVector, sql.and(clauses));
    const rows = yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)} FROM ${from}
      WHERE ${sql.and(clauses)} ORDER BY i.updated_at DESC, i.created_at DESC LIMIT ${cap}`;
    return rows.map(cardFromRow);
  });

  const addSpaceItem = Effect.fnUntraced(function* (spaceId: string, itemId: string) {
    const space = yield* getSpace(spaceId);
    if (!space) return yield* spaceNotFound(spaceId);
    if (space.kind !== "regular")
      return yield* invalidInput("items can only be added to a Regular Space");
    if (!(yield* readItem(ctx, itemId))) return yield* itemNotFound(itemId);
    yield* sql`INSERT OR IGNORE INTO space_items (space_id, item_id, added_at)
      VALUES (${spaceId}, ${itemId}, ${Date.now()})`;
  });

  const removeSpaceItem = Effect.fnUntraced(function* (spaceId: string, itemId: string) {
    if (!(yield* getSpace(spaceId))) return yield* spaceNotFound(spaceId);
    yield* sql`DELETE FROM space_items WHERE space_id = ${spaceId} AND item_id = ${itemId}`;
  });

  const listItemSpaces = (itemId: string) =>
    sql<{ id: string }>`SELECT s.id FROM space_items m JOIN spaces s ON s.id = m.space_id
      WHERE m.item_id = ${itemId} ORDER BY s.position, s.created_at`.pipe(
      Effect.map((rows) => rows.map((row) => row.id)),
    );

  return {
    listSpaces,
    getSpace,
    createSpace,
    updateSpace,
    deleteSpace,
    swapSpacePositions,
    listSpaceItems,
    addSpaceItem,
    removeSpaceItem,
    listItemSpaces,
  };
}
