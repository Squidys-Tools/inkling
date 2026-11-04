import { visualSubjects } from "@inkling/ingestion/photo-subjects";
import { Duration, Effect, Option } from "effect";
import { photoSearchLabels, photoSearchSubjects } from "../storage/photo-search.ts";
import {
  interfaceLabel,
  interfacePrompt,
  otherSubjects,
  subjectPrompt,
  type SubjectVectors,
} from "../storage/visual-subject.ts";
import { queryVector } from "./query-vector.ts";

// The subject prompts never change, so each vector is embedded once and kept. Until
// all are in, a photo Space matches by text; one open waits at most subjectWait, and
// the vectors embedded so far carry over to the next open.
const subjectWait = Duration.seconds(5);
const subjectPrompts = [
  ...[...visualSubjects, ...otherSubjects].map(
    (subject) => [subject, subjectPrompt(subject)] as const,
  ),
  [interfaceLabel, interfacePrompt] as const,
];

export function makeSubjectVectors() {
  const subjectVectors = new Map<string, ArrayLike<number>>();
  const loadSubjectVectors = Effect.suspend(() =>
    Effect.forEach(
      subjectPrompts.filter(([label]) => !subjectVectors.has(label)),
      ([label, prompt]) =>
        queryVector(prompt).pipe(
          Effect.flatMap((vector) =>
            vector?.length
              ? Effect.sync(() => void subjectVectors.set(label, vector))
              : Effect.fail(label),
          ),
        ),
      // About a hundred short prompts on a cold first open; a few at once keeps it quick.
      { discard: true, concurrency: 4 },
    ),
  ).pipe(
    Effect.timeoutOption(subjectWait),
    Effect.orElseSucceed(() => undefined),
    Effect.map((): SubjectVectors | null =>
      subjectVectors.size === subjectPrompts.length ? subjectVectors : null,
    ),
  );

  // Search adds confuser prompts without changing the Map the Smart Space classifier sees.
  let photoPrompts: SubjectVectors | null = null;
  const photoQueryPrompts = new Map<string, SubjectVectors>();
  const loadPhotoSearchVectors = Effect.fnUntraced(
    function* (query: string) {
      if (!photoPrompts) {
        const base = yield* loadSubjectVectors;
        if (!base) return null;
        const extras = yield* Effect.forEach(
          photoSearchLabels.filter((label) => !base.has(label)),
          (label) =>
            queryVector(subjectPrompt(label)).pipe(
              Effect.map((vector) => [label, vector] as const),
            ),
          { concurrency: 4 },
        );
        if (extras.some(([, vector]) => !vector?.length)) return null;
        photoPrompts = new Map([
          ...base,
          ...extras.map(([label, vector]) => [label, vector!] as const),
        ]);
      }
      const base = photoPrompts;
      const wanted = photoSearchSubjects(query);
      const missing = wanted.filter((label) => !base.has(label));
      if (!missing.length) return base;
      const key = JSON.stringify([...wanted].sort());
      const remembered = photoQueryPrompts.get(key);
      if (remembered) return remembered;
      const extra = yield* Effect.forEach(missing, (label) =>
        queryVector(subjectPrompt(label)).pipe(Effect.map((vector) => [label, vector] as const)),
      );
      if (extra.some(([, vector]) => !vector?.length)) return null;
      // Never add query-specific prompts to the shared Space/search guard inventory.
      const prompts = new Map([
        ...base,
        ...extra.map(([label, vector]) => [label, vector!] as const),
      ]);
      if (photoQueryPrompts.size >= 32)
        photoQueryPrompts.delete(photoQueryPrompts.keys().next().value!);
      photoQueryPrompts.set(key, prompts);
      return prompts;
    },
    Effect.timeoutOption(subjectWait),
    Effect.map(Option.getOrNull),
    Effect.orElseSucceed(() => null),
  );

  return { loadSubjectVectors, loadPhotoSearchVectors };
}
