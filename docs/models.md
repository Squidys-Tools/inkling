# Embedding models

The initial learned embedding pair is:

- Nomic Embed Text v1.5
- Nomic Embed Vision v1.5

Both models produce normalized 768-dimensional vectors in the same embedding
space. This lets a natural-language query match text items and image items.

## Runtime behavior

The Electron embedding runtime uses ONNX Runtime with the published INT8 ONNX
artifacts pinned to known Hugging Face revisions and verifies their SHA-256
hashes. Development builds download model files into:

```text
<library data directory>\models\nomic-embed-text-v1.5\
<library data directory>\models\nomic-embed-vision-v1.5\
```

The Windows installer bundles the pinned model files in the Electron resources
directory for offline use. Development builds download verified files to the
library data directory when an embedding job first needs them.

Text documents use the `search_document:` prefix. User queries use the
`search_query:` prefix. Vision preprocessing follows the model's 224px RGB
normalization and uses the CLS token from the vision output.

FTS5 and OCR remain active for exact terms, filenames, and numbers. Learned
embeddings are used for semantic text search, text-to-image search, and image
similarity. If the model bundle is unavailable, ordinary lexical search still
works; indexing reports the model error and can be retried.

The database stores the model identifier and vector dimension with every
embedding. Re-running an item's embedding job replaces an older vector for
that item and kind, which keeps model migrations recoverable through
regeneration. Changing the model revision requires regenerating existing
embeddings before the new revision can be used for meaningful similarity
comparisons.
