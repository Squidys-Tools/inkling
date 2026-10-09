# AI and Extraction Benchmarks

This directory contains the representative corpus and evaluation notes used to choose OCR, extraction, embedding, vision, and local language models.

The corpus should contain only files and URLs that we are allowed to use for local testing. Do not commit private or copyrighted material to the repository unless we have permission.

## Structure

```text
benchmarks/
  README.md
  manifest.json
  generate-corpus.ps1
  fetch-macrumors.ts
  embedding_comparison.py
  embedding_comparison_queries.json
  requirements-embedding-comparison.txt
  harness/
    index.ts
    manifest.ts
    server.ts
    extract.ts
    pdf.ts
    ocr.ts
    score.ts
    win-ocr.ps1
  corpus/
    articles/
    screenshots/
    images/
    pdfs/
    videos/
    notes/
    edge-cases/
    live/macrumors/
  expected/
    ocr/
    extraction/
    search/
    similarity/
  results/
```

## Corpus checklist

### Articles

- Short blog post
- Long-form essay
- News article
- Recipe
- Technical documentation page
- Article with footnotes
- Article with code blocks
- Article with an image gallery
- JavaScript-heavy article
- Page with ads and sticky navigation
- Paywalled or inaccessible page for failure handling
- Latest MacRumors article (live web page, fetched by `fetch-macrumors.ts`)

### Images and screenshots

- Photograph
- Design reference
- Screenshot with large text
- Screenshot with small text
- Meme
- Handwriting
- Multiple text columns
- Low-resolution image
- Rotated text
- Image with a visually similar partner
- Image with a visually different distractor

### PDFs

- Native-text PDF
- Scanned PDF
- Multi-column PDF
- PDF with tables
- PDF with images and captions
- PDF with bad or missing metadata

### Video and embeds

- YouTube page
- Vimeo page
- Article with an embedded video
- Page with an unsupported iframe
- Page with no playable media

### Notes and quotes

- Quick note
- Long note
- Note with Markdown
- Note with a todo
- Quote with a source URL
- Quote without a source URL

## Required manifest fields

Each corpus item should have a stable ID, relative path or URL, content type, language, expected extraction behavior, expected OCR text when applicable, search terms that should match, search terms that should not match, similarity group when applicable, and notes about known edge cases.

## Evaluation metrics

- OCR character and word accuracy
- Article extraction completeness
- Metadata accuracy
- Search recall and precision
- Semantic search relevance
- Image similarity relevance
- Summary usefulness
- CPU time and peak memory
- Model download size
- Cold-start time
- Batch processing time

## Compare embedding models locally

`embedding_comparison.py` compares the pinned Nomic ONNX pair with Google's quantized EmbeddingGemma 2 text-and-vision LiteRT model. The bundled run includes ordinary article/note/quote text, images and screenshots, and PDFs scored separately for text and visual queries. It also includes page renders of the PDFs and six synthetic chart/layout pairs with identical OCR text but different visual arrangements. It compares Nomic's current text/OCR indexing with an optional Nomic PDF-page-image path and EmbeddingGemma 2 at 70 and 140 vision tokens per image. It scores vector rankings only; it does not include FTS5 or the app's hybrid ranking.

To include items from your library, first copy a small, representative selection into a folder outside this repository. The runner reads those copies and never opens the live SQLite database or the library's asset store. Use `.txt` or `.md` files for notes, quotes, and article text; image files for photos and screenshots; and PDFs for documents. PDFs use their text layer by default. For scanned PDFs or images, add a `.txt` `text_path` containing the OCR text you want to evaluate. The manifest uses generic IDs, and each query names the relevant sample IDs:

```json
{
  "version": 1,
  "items": [
    {"id": "sample-note-01", "type": "note", "path": "items/note.md"},
    {"id": "sample-photo-01", "type": "image", "path": "items/photo.jpg"},
    {
      "id": "sample-pdf-01",
      "type": "pdf",
      "path": "items/report.pdf",
      "text_path": "items/report-text.txt"
    }
  ],
  "queries": [
    {"query": "What does the note say about planting herbs?", "relevant": ["sample-note-01"], "group": "library-text"},
    {"query": "Find the photo of the garden.", "relevant": ["sample-photo-01"], "group": "library-image"},
    {"query": "What does the report say about the project deadline?", "relevant": ["sample-pdf-01"], "group": "library-pdf-text"},
    {"query": "Find the report page with a map.", "relevant": ["sample-pdf-01"], "group": "library-pdf-visual"}
  ]
}
```

Supported query groups are `library-text`, `library-image`, `library-screenshot`, `library-pdf-text`, and `library-pdf-visual`. Paths must stay inside the folder containing the manifest. Library queries are ranked against the selected library samples only, separately from the bundled fixtures, so generated documents cannot skew the local-sample scores. Index timings cover both fixture and sample inputs. Do not put the selected files or manifest in the repository, and do not share them. When a library manifest is used, the JSON report keeps aggregate scores and timings but omits per-query text, item IDs, and individual rankings. Rendered PDF pages stay in the benchmark cache alongside model files; remove that cache after the run if you want to delete those derived copies.

On Windows, run it with your existing Python 3.11 through `uv`:

```powershell
uv run --no-project --no-managed-python --python 3.11 --with-requirements benchmarks/requirements-embedding-comparison.txt benchmarks/embedding_comparison.py
```

For a local sample bundle, add the manifest path:

```powershell
uv run --no-project --no-managed-python --python 3.11 --with-requirements benchmarks/requirements-embedding-comparison.txt benchmarks/embedding_comparison.py --library-manifest "C:\Users\you\Documents\inkling-samples\manifest.json"
```

`--no-managed-python` prevents `uv` from downloading another Python interpreter; the command uses the installed 3.11 and installs the pinned packages into uv's cache, not system-wide. The first run downloads about 620 MB of model artifacts, checks each file against a pinned SHA-256 digest, and caches the weights and rendered pages under the operating system's user cache directory. The JSON report is written there too; pass `--output <path>` after the script name to choose another report destination. It includes per-group Hit@1/Hit@3/MRR, image-similarity results, model file sizes, inference timings, and process RSS. The committed PDFs are single-page; the runner processes every page if more are added.

The default compares both models on CPU. `--gemma-backend gpu` or `--gemma-backend npu` can measure LiteRT acceleration when supported, but Nomic still runs on CPU, so those timings are not a like-for-like backend comparison. The fixed OCR expectation files make the Nomic text baseline repeatable; this benchmark does not time or score Windows OCR itself.

## Workflow

1. Add files and URLs to `corpus/`.
2. Record them in `manifest.json`.
3. Add expected outputs under `expected/`.
4. Run the benchmark harness.
5. Store machine and model information with results.
6. Compare candidates before selecting production models.

## Running the harness

Requires [Bun](https://bun.sh) (the harness and the ingestion pipeline are
TypeScript). From the repo root:

```sh
bun benchmarks/harness/index.ts   # or: bun run bench
```

On Windows, run the native PDF end-to-end tests as well:

```powershell
bun run test:windows:pdfs
```

These tests save the benchmark PDFs into a temporary SQLite library, run the
same persisted OCR/extraction and embedding jobs used by the desktop app, and
verify searchable text, stored embeddings, and terminal job status. The
`pdf-scanned-01` case exercises Windows PDF rendering plus `Windows.Media.Ocr`.

What it does:

1. Serves `corpus/` over a local HTTP server (`harness/server.ts`) so the
   fixture pages are fetched exactly like live pages.
2. For `article` / `recipe` / `video` items, runs the production extraction
   pipeline (`ingestUrl` → Defuddle → sanitize) via `harness/extract.ts`.
3. For PDFs, runs a minimal content-stream text extractor
   (`harness/pdf.ts`; label `naive-streams`). Real-world PDFs need a full
   parser in a later milestone. Scanned PDFs fall back to OCR on their
   embedded JPEG (`extractFirstEmbeddedJpeg`).
4. For OCR items (screenshots, text images, scanned PDFs), runs **every
   available engine** (`harness/ocr.ts`) and keeps the best-scoring result:
   **Windows built-in OCR** (`Windows.Media.Ocr`, invoked via
   `harness/win-ocr.ps1` — zero-install on Windows) and a **tesseract.js**
   runner (multi-PSM 3/6/7, highest-confidence pass wins).
5. Scores each item against `expected` (title/author/search terms/must-not
   match/embeds/image counts) and writes `results/results-latest.json`, a
   timestamped copy, and `results/summary.md`.

Scoring notes: search terms are matched across the extracted
title + description + text (whitespace-normalized on both sides), mirroring
how a saved item would be searched. OCR items are scored with token recall +
precision against `expected/ocr/`.

## Initial findings

Baseline run on the 42-item corpus with the `windows-ocr` engine:

- **25 pass, 8 partial, 1 fail, 8 skip — overall 0.940.**
- 8 skips: vision / similarity items (photos, design refs, similar pairs,
  distractor, low-res) — these need the embeddings benchmark.

After fixes (JSON-LD article metadata, `<noscript>` fallback text, author
byline heuristics, a multi-engine OCR harness, and more legible generated
meme/scanned-PDF fixtures), the same 42 items plus 6 live MacRumors pages:

- **36 pass, 4 partial, 0 fail, 8 skip — overall 0.992.**
- All 6 live-article fixtures pass at 1.000, verifying extraction against
  real-world macrumors.com markup (title, author, and search terms all match;
  authors come from the articles' own JSON-LD).
- Fixed by the above:
  - `article-news-01` / `article-recipe-01` (byline authors now recognized),
    `article-js-heavy-01` (noscript fallback text restored), `image-meme-01`
    (0.93, was fail), `pdf-scanned-01` (full memo OCR'd in order).
- Remaining partials are genuine engine limits, not fixture errors:
  - `screenshot-large-text-01` 0.97 and `screenshot-small-text-01` 0.86
    (Windows OCR misses a few dense tokens; the small-text one is a dense
    table, 110 tokens).
  - `image-rotated-01` 0.92 (Windows OCR misses 6 of 36 rotated tokens).
  - `image-meme-01` 0.93 (OCR merges some words; stylized Impact text).
- Engine split observed: tesseract.js wins on the two-column layout and the
  scanned PDF; Windows OCR wins on the meme, handwriting, rotated image, and
  screenshots. Best-of-multi-engine is therefore the right default.

Fixtures deliberately model realistic pages; these residual gaps are
documented as findings.

## Refreshing fixtures

```sh
# Regenerate deterministic images/screenshots/PDFs and expected/ocr/*.txt
pwsh -File benchmarks/generate-corpus.ps1

# Fetch the N (default 6) newest MacRumors articles as live fixtures
bun benchmarks/fetch-macrumors.ts 6
```

`fetch-macrumors.ts` re-runs are incremental: it skips articles already in
the manifest, rewrites only the `article-live-macrumors-*` entries, and
verifies every fixture through the production ingestion pipeline before
updating the manifest. Delete the `corpus/live/macrumors/*.html` files and
the `article-live-macrumors-*` manifest entries to drop them.
