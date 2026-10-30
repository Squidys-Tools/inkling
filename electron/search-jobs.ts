import { Effect } from "effect";
import { captionTags, contentHash } from "./search-core.ts";
import type { createSearchModels } from "./search-models.ts";
import { readAsset, reportProgress, requireItem } from "./job-items.ts";
import { attempt } from "./storage/errors.ts";
import { Library } from "./storage/library.ts";
import type { Job } from "./storage/jobs.ts";

type SearchModels = ReturnType<typeof createSearchModels>;

export const captionImage = (models: SearchModels) =>
  Effect.fnUntraced(function* (job: Job, workerId: string) {
    const library = yield* Library;
    const item = yield* requireItem(job.itemId, "image");
    if (!item.localAssetPath) return;
    yield* reportProgress(job, workerId, 0, 1, "Describing image locally");
    const image = yield* readAsset(item.localAssetPath);
    const caption = yield* attempt(() => models.caption(image));
    yield* library.storeSearchAnnotation(
      item.id,
      item.localAssetPath,
      caption,
      captionTags(caption),
    );
    yield* reportProgress(job, workerId, 1, 1, "Description indexed");
  });

export const generateSearchEmbedding = (models: SearchModels) =>
  Effect.fnUntraced(function* (job: Job, workerId: string) {
    const library = yield* Library;
    const input = yield* library.searchInput(job.itemId);
    if (!input) return;
    const vectors: { kind: "text" | "image"; chunkId: string; vector: Float32Array }[] = [];
    const total = input.chunks.length + Number(input.item.kind === "image");
    let current = 0;
    yield* reportProgress(job, workerId, 0, total, "Loading local search models");
    if (input.item.kind === "image") {
      const image = yield* readAsset(input.item.localAssetPath);
      const hash = contentHash(image);
      const cached = yield* library.cachedSearchImage(input.item.id, hash);
      const vector = cached ?? (yield* attempt(() => models.embedImage(image)));
      vectors.push({ kind: "image", chunkId: `image:${hash}`, vector });
      yield* library.storeSearchImage(input.item.id, input.revision, vector, hash);
      current += 1;
      yield* reportProgress(job, workerId, current, total, "Image search ready");
    }
    for (const chunk of input.chunks) {
      const vector = yield* attempt(() =>
        models.embedText(chunk.text, input.item.title ?? undefined),
      );
      vectors.push({ kind: "text", chunkId: chunk.id, vector });
      current += 1;
      yield* reportProgress(job, workerId, current, total, "Indexing document passages");
    }
    yield* library.storeSearchIndex(input.item.id, input.revision, input.chunks, vectors);
  });
