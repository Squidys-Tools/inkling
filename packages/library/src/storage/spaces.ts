import { randomUUID } from "node:crypto";
import { Effect, Predicate, Schema } from "effect";
import {
  type CreateSpaceInput,
  type SpaceQuery,
  SpaceColor,
  type Space,
  type UpdateSpaceInput,
} from "@inkling/contracts";
import { IMAGE_MODEL } from "@inkling/contracts/jobs";
import type { Fragment } from "effect/sql/Statement";
import type { StorageContext } from "./context.ts";
import { cardFromRow, type ItemRow, qualifiedItemColumns, readCursor, readItem } from "./rows.ts";
import { changes, clampLimit, nonEmpty, parseJson } from "./shared.ts";
import { invalidInput, itemNotFound, spaceNotFound } from "./errors.ts";
import { escapeFtsQuery, type makeSearch, type QueryVector, sqlLikePattern } from "./search.ts";
import {
  decodeVector,
  interfaceLabel,
  labelImage,
  type SubjectVectors,
  visualSubjectQuery,
  visualSubjects,
} from "./visual-subject.ts";

type SpaceRow = {
  id: string;
  name: string;
  color: SpaceColor;
  query: string;
  kind: Space["kind"];
  position: number;
  created_at: number;
  updated_at: number;
  item_count?: number | null;
};

function spaceFromRow(row: SpaceRow): Space {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    query: parseJson<SpaceQuery>(row.query, {}),
    kind: row.kind,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.kind === "regular" && row.item_count != null ? { itemCount: row.item_count } : {}),
  };
}

/** The text a Smart Space searches for. One with no filters at all searches for its
 *  own name, so a Space called "Cats" means cats; the saved query stays as it is. */
export function smartSpaceText(space: Pick<Space, "kind" | "name" | "query">) {
  if (space.kind !== "smart") return "";
  const { text, kind, tag } = space.query;
  return nonEmpty(text) ?? (!nonEmpty(kind) && !nonEmpty(tag) ? space.name.trim() : "");
}

/** The photo subjects a Smart Space collects, or null when it is an ordinary search.
 *  A kind filter ("note", say) keeps the search textual, so notes appear only when asked for. */
export function smartSpaceSubjects(space: Pick<Space, "kind" | "name" | "query">) {
  if (space.kind !== "smart" || nonEmpty(space.query.kind)) return null;
  return visualSubjectQuery(smartSpaceText(space));
}

export const validateSmartQuery = Effect.fnUntraced(function* (query: unknown = {}) {
  if (!Predicate.isObject(query)) return yield* invalidInput("Space query must be an object");
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

const normalizeSpaceName = Effect.fnUntraced(function* (name: string) {
  const normalized = name.trim();
  if (!normalized) return yield* invalidInput("space name cannot be empty");
  if (Buffer.byteLength(normalized) > 80)
    return yield* invalidInput("space name must be at most 80 characters");
  return normalized;
});

// A Regular Space pages by when each item was added, newest first.
const MemberCursor = Schema.Tuple([Schema.Finite, Schema.String]);
const decodeMemberCursor = Schema.decodeUnknownOption(Schema.fromJsonString(MemberCursor));

// A Smart Space is a ranked search, so it answers with its best matches in one
// page of at most this many cards; `total` still counts every match.
const SMART_SPACE_CAP = 200;

export function normalizeSpaceColor(color: unknown): SpaceColor {
  const normalized = nonEmpty(color)?.toLowerCase();
  return SpaceColor.literals.find((value) => value === normalized) ?? "blue";
}

export function makeSpaces(ctx: StorageContext, search: ReturnType<typeof makeSearch>) {
  const { sql } = ctx;

  const listSpaces = () =>
    sql<SpaceRow>`SELECT spaces.*, membership.item_count FROM spaces
      LEFT JOIN (
        SELECT s.space_id, COUNT(*) AS item_count FROM space_items s
        JOIN items i ON i.id = s.item_id WHERE i.archived = 0 GROUP BY s.space_id
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

  const memberPage = Effect.fnUntraced(function* (
    id: string,
    cursor: string | null,
    limit: number,
  ) {
    const after = yield* readCursor(decodeMemberCursor, cursor);
    const rows = yield* sql<ItemRow & { added_at: number }>`SELECT
      ${sql.literal(qualifiedItemColumns)}, s.added_at
      FROM space_items s JOIN items i ON i.id = s.item_id
      WHERE s.space_id = ${id} AND i.archived = 0
      ${after ? sql`AND (s.added_at < ${after[0]} OR (s.added_at = ${after[0]} AND i.id > ${after[1]}))` : sql.literal("")}
      ORDER BY s.added_at DESC, i.id LIMIT ${limit + 1}`;
    const [{ total }] = yield* sql<{ total: number }>`SELECT COUNT(*) AS total
      FROM space_items s JOIN items i ON i.id = s.item_id
      WHERE s.space_id = ${id} AND i.archived = 0`;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      cards: page.map(cardFromRow),
      next:
        rows.length > limit && last
          ? JSON.stringify([last.added_at, last.id] satisfies typeof MemberCursor.Type)
          : null,
      total,
    };
  });

  // Photos whose vision vector is labelled one of the subjects, best first. Images
  // not yet analyzed have no vector and stay out; so do notes and screenshots.
  const subjectMatches = Effect.fnUntraced(function* (
    subjects: string[],
    tag: string | null,
    cap: number,
    prompts: SubjectVectors | null,
  ) {
    // Every label must compete, or a screenshot could win "cat" by default. With no
    // worker or models yet nothing can be confirmed, so the Space is empty for now.
    const labels = [...visualSubjects, interfaceLabel];
    if (!prompts || !labels.every((label) => prompts.get(label)?.length))
      return { cards: [], total: 0 };
    const rows = yield* sql<
      ItemRow & { embedding_dimension: number; embedding_vector: Uint8Array }
    >`
      SELECT ${sql.literal(qualifiedItemColumns)},
      e.dimension AS embedding_dimension, e.vector AS embedding_vector
      FROM item_embeddings e JOIN items i ON i.id = e.item_id
      WHERE i.archived = 0 AND i.kind = 'image' AND e.kind = 'image' AND e.model = ${IMAGE_MODEL}
      ${tag ? sql`AND i.id IN (SELECT value FROM json_each(${yield* taggedItemIds(tag)}))` : sql.literal("")}`;
    const wanted = new Set(subjects);
    const matches = rows
      .flatMap((row) => {
        const image = decodeVector(row.embedding_vector, row.embedding_dimension);
        const best = image && labelImage(image, prompts);
        return best && wanted.has(best.label) ? [{ row, score: best.score }] : [];
      })
      .sort(
        (left, right) => right.score - left.score || right.row.updated_at - left.row.updated_at,
      );
    return {
      cards: matches.slice(0, cap).map(({ row }) => cardFromRow(row)),
      total: matches.length,
    };
  });

  const smartMatches = Effect.fnUntraced(function* (
    space: Space,
    cap: number,
    queryVector: QueryVector,
    subjectVectors: SubjectVectors | null,
  ) {
    const query = space.query;
    const subjects = smartSpaceSubjects(space);
    if (subjects) return yield* subjectMatches(subjects, nonEmpty(query.tag), cap, subjectVectors);
    const text = nonEmpty(smartSpaceText(space));
    const clauses: Fragment[] = [sql`i.archived = 0`];
    let from = sql.literal("items i");
    let rankedCandidates: ReturnType<typeof cardFromRow>[] | null = null;
    if (text && queryVector?.length) {
      rankedCandidates = yield* search.searchItems(text, SMART_SPACE_CAP, queryVector);
      if (!rankedCandidates.length) return { cards: [], total: 0 };
      const ids = JSON.stringify(rankedCandidates.map((item) => item.id));
      clauses.push(sql`i.id IN (SELECT value FROM json_each(${ids}))`);
    } else if (text && ctx.fts5Enabled) {
      const match = escapeFtsQuery(text);
      if (!match) return { cards: [], total: 0 };
      from = sql.literal("items_fts f JOIN items i ON i.id = f.item_id");
      clauses.push(sql`items_fts MATCH ${match}`);
    } else if (text) {
      clauses.push(search.likeClause(sqlLikePattern(text), "i."));
    }
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
    const where = sql.and(clauses);
    const [{ total }] = yield* sql<{ total: number }>`SELECT COUNT(*) AS total FROM ${from}
      WHERE ${where}`;
    const rows = yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)} FROM ${from}
      WHERE ${where} ORDER BY i.updated_at DESC, i.created_at DESC
      LIMIT ${rankedCandidates ? SMART_SPACE_CAP : cap}`;
    if (rankedCandidates) {
      const matchingIds = new Set(rows.map((row) => row.id));
      return {
        cards: rankedCandidates.filter((item) => matchingIds.has(item.id)).slice(0, cap),
        total,
      };
    }
    return { cards: rows.map(cardFromRow), total };
  });

  /** One page of a Space: keyset pages for a Regular Space, the capped ranked matches for a Smart one. */
  const spaceCardsPage = Effect.fnUntraced(function* (
    id: string,
    cursor: string | null,
    limit: number,
    queryVector: QueryVector = null,
    subjectVectors: SubjectVectors | null = null,
  ) {
    const space = yield* getSpace(id);
    if (!space) return yield* spaceNotFound(id);
    if (space.kind === "regular") return yield* memberPage(id, cursor, clampLimit(limit, 100, 200));
    const { cards, total } = yield* smartMatches(
      space,
      SMART_SPACE_CAP,
      queryVector,
      subjectVectors,
    );
    return { cards: cursor == null ? cards : [], next: null, total };
  });

  const listSpaceItems = Effect.fnUntraced(function* (
    id: string,
    limit = 100,
    queryVector: QueryVector = null,
    subjectVectors: SubjectVectors | null = null,
  ) {
    const space = yield* getSpace(id);
    if (!space) return yield* spaceNotFound(id);
    const cap = clampLimit(limit, 100, SMART_SPACE_CAP);
    if (space.kind === "regular") return (yield* memberPage(id, null, cap)).cards;
    return (yield* smartMatches(space, cap, queryVector, subjectVectors)).cards;
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
    spaceCardsPage,
    listSpaceItems,
    addSpaceItem,
    removeSpaceItem,
    listItemSpaces,
  };
}
