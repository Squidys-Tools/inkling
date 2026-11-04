# Embedding models

inkling embeds items with two models:

- Nomic Embed Text v1.5
- Nomic Embed Vision v1.5

Both produce normalized 768-dimensional vectors in the same embedding space, so
a natural-language query can match text items and image items.

## Runtime behavior

The worker process runs the published INT8 ONNX artifacts through ONNX
Runtime. `packages/jobs/src/model-manifest.json` pins each file to a Hugging Face
revision and a SHA-256 hash, and the app checks the hash before it loads a file.

Every build from `bun run dist` bundles the model files in its resources
directory, so it works offline. An unpackaged run (`bun run dev:app`)
downloads them into `<library data directory>/models/<model name>/` when an
embedding job first needs them.

Stored text uses the `search_document:` prefix and queries use
`search_query:`. Vision preprocessing follows the model's 224px RGB
normalization and uses the CLS token from the vision output.

FTS5 and OCR still handle exact terms, filenames and numbers. The embeddings
drive semantic text search, text-to-image search and image similarity. If the
models are unavailable, lexical search still works, and the embedding job
records the error so it can be retried.

The database stores the model identifier and vector dimension with every
embedding, and an item keeps one vector of each kind, which its next embedding
job replaces. Search and the Similar tab read only vectors from the current
`TEXT_MODEL` and `IMAGE_MODEL` in `packages/contracts/src/jobs.ts`. At startup
the library re-queues every image whose vector came from another image model;
nothing does that for text, so changing `TEXT_MODEL` needs its own backfill or
text items drop out of semantic search until an edit re-queues their embedding.
