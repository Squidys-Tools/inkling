# Similar items

An open item's Similar section lists items the library ranks as related. Status: **driven** on 2026-11-13 — empty and populated. The seeded library has no `item_embeddings` rows (no ingestion pipeline), so a fresh run shows the empty copy. The viewed item needs its own `item_embeddings` row — `searchSimilar` returns `[]` without one — so a seed item stays empty until it is itself embedded; capturing this run's own items (or editing one, which re-enqueues `generate_embedding`) is what populates the section.

## Sub-features

- `similar-empty` the Similar section renders and shows "Nothing similar yet." when nothing is related.
- `similar-populated` results appear as `button "<title>"` tiles; text-kind tiles carry a kind label (`NOTE`, `ARTICLE`, …).
- Not driven: clicking a similar item's tile — tiles repeat names (two results can both read `Untitled note`), so a `ref` click trips the `AMBIGUOUS_TARGET` twin guard and keyboard `Tab`+`Enter` lands on the section's own Close instead.

## How to get to it (user POV)

- Open an item card; choose **Similar** in the Item sections row, or scroll — Similar follows Info on the same page.

## Driving it with agent-desktop

Preconditions: seeded library. Similar results lazy-load once the section approaches the fold, and choosing the tab scrolls it in.

- **Open.** `$I ad click "$($I ref group 'Article: The Hundred-Year Language')"`.
- **Go to Similar.** `$I ad click "$($I ref button Similar)"` (inside `navigation "Item sections"`; the active button carries `current` state).
- **Proof.** `$I ad find --name 'Nothing similar yet.'` returns one `statictext` under `group:Similar` (`tree` lists only interactive nodes, so it never shows this text). `$I shot s1`.

## Gotchas

- With the section off-screen its panel may not have rendered yet; the `Similar` button both scrolls to it and triggers the load.
- A run with real embedding data lists tiles instead — assert presence, not order. Only the generic text tile shows a kind label: an Image tile is a bare `<img>` and a Quote tile shows mark/title/description, so don't grep every tile for `ARTICLE:`/`NOTE:`. Text similarity returns only `article`/`url`/`note`/`quote` kinds (active items); image similarity returns only `image`.
- The section's query is not invalidated by library changes: an empty result rendered before the viewed item's embedding lands stays empty until the item is remounted — close and reopen the item to force the refetch.
