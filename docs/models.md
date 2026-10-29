# Local search models

## Active index

`electron/search-model-manifest.json` pins the source revision, download URL and SHA-256 of every shipped asset. The active model pair is:

- **EmbeddingGemma 2**, ONNX Community q8 export of Google's model (Apache-2.0): normalized 768-dimensional text and image embeddings. The embedding space is independent of Nomic, even though both have 768 dimensions.
- **Florence-2-base-ft**, ONNX Community q8 export of Microsoft's model (MIT): short image captions. Suggested tags are derived from captions, not an independent object detector.

The runtime uses Transformers.js and ONNX Runtime on CPU, with two intra-op threads and one inter-op thread. Quantization applies to weights; this export has float32 activations and outputs, not fp16. Text queries use `task: search result | query: ...`; document passages use `title: ... | text: ...`. Image preprocessing is supplied by the pinned model processor.

## Capture and backfill

Thumbnails stay on their own fast job lane. Images receive a visual vector before OCR. Existing library items backfill one at a time while idle; captions follow initial indexing. OCR and captions cause passage reindexing, reusing a content-hashed image vector. Long documents use overlapping passages of at most 1,800 UTF-16 code units with 180-unit overlap, preserving Unicode boundaries. PDF pages are stored separately and each passage retains its page number.

EmbeddingGemma 2 and Florence inference run in a bounded worker queue. Queries take priority over queued background work but cannot interrupt an active inference. This worker is retired when switching model families or after 60 seconds idle, reclaiming its native model arenas; its individual calls have a two-minute ceiling. The retained Nomic fallback query encoder still owns and runs its ONNX session in the main process, outside this worker's timeout and retirement lifecycle, so its memory is not covered by worker-recycling measurements.

Published original-asset paths are immutable. Saving an existing item under the same filename uses exclusive-create and a fresh basename rather than overwriting bytes an in-flight decoder might own. Caption, PDF page and OCR commits are bound to that asset path. Vector/chunk commits additionally check the item's revision atomically. Background metadata does not replace user titles/tags/OCR. Removing a suggested tag is persisted as a tombstone and survives recaptioning and export/import.

## Retrieval and migration

FTS5 (or escaped LIKE fallback) handles exact names, OCR, numbers and passage text. Text and visual vectors have separate acceptance floors (0.70 text, 0.63 image for the current pinned index). Reciprocal-rank fusion combines independently ranked lanes, deduplicating items rather than comparing raw scores across model families. Smart Space kind/tag/exclusion predicates apply before lane limits. These calibrated floors are not universal model constants; changing the model, processor or floor policy requires a new index version and a fresh evaluation.

New vectors, passages, page text, AI annotations and readiness state live in separate `search_*` tables. Revision fences hide stale passages/vectors while edits reindex. Archived items are excluded and deletion clears their indexes. Legacy Nomic vectors remain intact and are queried only with the Nomic query encoder; the old 0.55 floor is retained for that fallback. They are never compared with Gemma vectors. The previous Nomic normalization and 224px vision processor remain unchanged for this migration lane.

Queries never download models. Packaged builds bundle all pinned files; development indexing may fetch verified assets into `<library>/models/search/<repo>`. Missing/broken models produce an explicit visual-search-unavailable notice while exact text search continues. `get_search_progress` reports ready and total active items; the library shows indexing progress.

## Validation boundaries

Linux CPU inference and source storage have local regression evidence. Public IPC, the built interface, packaged resources and the local preview installer are separate verification gates; a source review alone does not establish their completion. A small independently labeled image corpus and synthetic PDF fixtures provide regression evidence, not general accuracy certification. Public photos can overlap model pretraining; PDF calibration and held-out query phrasings share the same three synthetic documents. Quantized parity is measured against the matching float32 ONNX export, not official PyTorch inference. Windows runtime and installer execution still require a Windows machine.
