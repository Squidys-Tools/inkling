# Smart-search behavior proposed in #217

This PR intentionally includes the following behaviors. They are not inferred from passing tests, and this document does not amend the repository's current product principles or record maintainer approval.

- Photo details retain a visible local description and removable suggested tags. Removal stores a durable suppression choice; it does not rewrite the original photo, OCR or user-authored tags. This differs from the current quiet-intelligence / no-tag-administration policy and needs explicit maintainer acceptance before merging.
- A legacy Smart Space with no saved text, kind or tag uses its name as its missing search intent without changing the stored/exported query. A subject-only name such as Cats means pictures with affirmative local subject evidence, not notes or screenshots containing that word. Photos without sufficient analysis are omitted until evidence is available. Explicit text/kind/tag queries keep their saved meaning.
- These two choices are deliberate requester preferences. They are proposed behavior for repository review, not a claim of repository-policy sign-off.

## Engineering limits and recovery

- Subject admission currently examines the scoped active images in JavaScript before the capped retrieval lanes. This is linear in the image count; no large-library query-latency improvement is claimed. Conservative evidence can omit a real subject when its caption is missing or ambiguous.
- A current terminal model-job failure remains visible and requires the existing explicit processing Retry action after its bounded retries. Automatic idle backfill must not hot-loop on corrupt input or unavailable models. Older failed history no longer fences a later successful job or a subsequent item edit. No availability-triggered automatic retry is claimed.
- The inference lane keeps one resident embedding/caption model family at a time. Family switches retire the previous worker to release native allocations and may reload the other model per item. This is a resource-residency trade-off, not a throughput or indexing-speed improvement. CPU fallback and the separate text-query lane remain.
- Local worker diagnostics retain bounded, redacted causes and exit signals, separate from short user-facing errors. Diagnostic tests use controlled errors, not live photo contents or model inference.
- Exports snapshot the whole database. The manifest distinguishes regenerable vectors/chunks/index state/revision from the durable suggested-tag suppression choice; restore preserves that choice.

Native packaged model execution, general vision accuracy, memory use and performance are not certified by source/type/unit checks.
