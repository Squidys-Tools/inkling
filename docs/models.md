# Embedding models

inkling embeds items with two models:

- Nomic Embed Text v1.5
- Nomic Embed Vision v1.5

Both produce normalized 768-dimensional vectors in the same embedding space, so
a natural-language query can match text items and image items.

## Runtime behavior

The Electron main process runs the published INT8 ONNX artifacts through ONNX
Runtime. `electron/model-manifest.json` pins each file to a Hugging Face
revision and a SHA-256 hash, and the app checks the hash before it loads a file.

Packaged builds (the Windows installer, the `.deb` and the AppImage) bundle the
model files in their resources directory, so they work offline. Development
builds download the files into `<library data directory>/models/<model name>/`
when an embedding job first needs them.

Stored text uses the `search_document:` prefix and queries use
`search_query:`. Vision preprocessing follows the model's 224px RGB
normalization and uses the CLS token from the vision output.

FTS5 and OCR still handle exact terms, filenames and numbers. The embeddings
drive semantic text search, text-to-image search and image similarity. If the
models are unavailable, lexical search still works, and the embedding job
records the error so it can be retried.

The database stores the model identifier and vector dimension with every
embedding. Re-running an item's embedding job replaces its older vector of the
same kind, so a model change is recovered by regenerating embeddings. After a
model revision changes, regenerate existing embeddings before comparing
similarity across items.
