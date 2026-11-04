import type { LibraryCard } from "@inkling/contracts";
import { IMAGE_MODEL } from "@inkling/contracts/jobs";
import { visualSubjectQuery, visualSubjects } from "@inkling/ingestion/photo-subjects";
import { Effect } from "effect";
import type { StorageContext } from "./context.ts";
import { cardFromRow, type ItemRow, qualifiedItemColumns } from "./rows.ts";
import { clampLimit } from "./shared.ts";
import {
  decodeVector,
  interfaceLabel,
  otherSubjects,
  type SubjectVectors,
} from "./visual-subject.ts";

// Search keeps the Space vocabulary and adds the closest vehicle/canid confusers.
// This does not change the existing Smart Space classifier or its saved query.
export const photoSearchLabels = [
  ...visualSubjects,
  interfaceLabel,
  ...otherSubjects,
  "truck",
  "wolf",
  "tractor",
];

// Photo/text scores (.03-.09) cannot use the .55 text floor. Competing prompts
// with a small ambiguity allowance retain nearby dogs and background cars.
// Exploratory calibration uses audited saved vectors, not an independent
// held-out corpus or a universal accuracy guarantee.
const photoSearchAmbiguity = 0.005;

// The Space vocabulary is not a search allowlist: any description can supply
// its own photo prompt, while the existing nouns retain their calibrated guard.
export function photoSearchSubjects(query: string) {
  const text = query.trim().toLowerCase();
  return visualSubjectQuery(text) ?? (text ? [text] : []);
}

export function photoSearchScore(
  image: ArrayLike<number>,
  subjects: readonly string[],
  prompts: SubjectVectors,
  allowAmbiguity = true,
) {
  if (!image.length) return null;
  let best = -Infinity;
  let competing = -Infinity;
  let wanted = -Infinity;
  let bestLabel = "";
  for (const label of new Set([...photoSearchLabels, ...subjects])) {
    const prompt = prompts.get(label);
    // Partial or incompatible prompts must not force every photo into a wanted noun.
    if (!prompt || prompt.length !== image.length) return null;
    let score = 0;
    for (let index = 0; index < image.length; index += 1) score += image[index] * prompt[index];
    if (!Number.isFinite(score)) return null;
    if (score > best) {
      best = score;
      bestLabel = label;
    }
    if (subjects.includes(label)) wanted = Math.max(wanted, score);
    else competing = Math.max(competing, score);
  }
  if (bestLabel === interfaceLabel || wanted === -Infinity) return null;
  // New descriptions must beat the guard prompts, not borrow the known-noun
  // ambiguity allowance to return weakly related tail results.
  const floor = allowAmbiguity ? best - photoSearchAmbiguity : competing + photoSearchAmbiguity;
  return wanted >= floor ? wanted : null;
}

/** Keep the normal ranked text/OCR/note matches first, deduplicate, then cap. */
export function supplementPhotoMatches(
  ranked: readonly LibraryCard[],
  photos: readonly LibraryCard[],
  limit = 100,
) {
  const seen = new Set<string>();
  return [...ranked, ...photos]
    .filter((card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    })
    .slice(0, clampLimit(limit, 100, 200));
}

/** Query-driven photo evidence supplements, never replaces, ordinary text search. */
export function makePhotoSearch({ sql }: StorageContext) {
  let cached: {
    signature: string;
    prompts: SubjectVectors;
    matches: Map<string, { id: string; score: number }[]>;
  } | null = null;
  const searchPhotoSubjects = Effect.fnUntraced(function* (
    query: string,
    limit = 100,
    prompts: SubjectVectors | null = null,
  ) {
    const subjects = photoSearchSubjects(query);
    if (!subjects.length || !prompts || !photoSearchLabels.every((label) => prompts.has(label)))
      return [];
    const allowAmbiguity = visualSubjectQuery(query) !== null;
    const cap = clampLimit(limit, 100, 200);
    // The library owns writes; row count/rowid also notice external insert/delete fixtures.
    const [state] = yield* sql<{ changes: number; total: number; last: number }>`SELECT
      total_changes() AS changes, COUNT(*) AS total, COALESCE(MAX(rowid), 0) AS last FROM item_embeddings`;
    const signature = `${state.changes}:${state.total}:${state.last}`;
    if (cached?.signature !== signature || cached.prompts !== prompts)
      cached = { signature, prompts, matches: new Map() };
    const key = [...subjects].sort().join(",");
    let matches = cached.matches.get(key);
    if (!matches) {
      const started = cached;
      // Fetch vector bytes only; full metadata is read for the winners.
      const vectors = yield* sql<{ item_id: string; dimension: number; vector: Uint8Array }>`
        SELECT e.item_id, e.dimension, e.vector FROM item_embeddings e
        JOIN items i ON i.id = e.item_id
        WHERE i.archived = 0 AND i.kind = 'image' AND e.kind = 'image' AND e.model = ${IMAGE_MODEL}`;
      matches = [];
      for (const row of vectors) {
        const image = decodeVector(row.vector, row.dimension);
        if (!image) continue;
        const score = photoSearchScore(image, subjects, prompts, allowAmbiguity);
        if (score !== null) matches.push({ id: row.item_id, score });
      }
      // A result crossing another write is never inserted into the newer cache.
      if (cached === started) {
        if (cached.matches.size >= 32) cached.matches.delete(cached.matches.keys().next().value!);
        cached.matches.set(key, matches);
      }
    }
    if (!matches.length) return [];
    // Keep the complete boundary tie; the final sort uses the item's timestamp.
    const scored = [...matches].sort((a, b) => b.score - a.score);
    const floor = scored[Math.min(cap, scored.length) - 1].score;
    const winners = scored.filter((row) => row.score >= floor);
    const scores = new Map(winners.map((row) => [row.id, row.score]));
    const cards = yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)} FROM items i
      WHERE i.archived = 0 AND i.id IN (SELECT value FROM json_each(${JSON.stringify(winners.map((row) => row.id))}))`;
    return [...cards]
      .sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || b.updated_at - a.updated_at)
      .slice(0, cap)
      .map(cardFromRow);
  });
  return { searchPhotoSubjects };
}
