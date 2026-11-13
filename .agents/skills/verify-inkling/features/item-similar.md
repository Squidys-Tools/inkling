# Similar items

An open item's Similar section lists items the library ranks as related. Status: **driven** on 2026-11-13 — empty and populated. The seeded library has no `item_embeddings` rows (no ingestion pipeline), so a fresh run shows the empty copy; once this run's own captures finish their `generate_embedding` jobs the section populates, even for a viewed item that has no embedding row of its own.

## Sub-features

- `similar-empty` the Similar section renders and shows "Nothing similar yet." when nothing is related.
- `similar-populated` results appear as `button "<title>"` tiles with a kind label (`NOTE`, `ARTICLE`, …).
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
- A run with real embedding data lists tiles instead — each is a `button` named by the item title beside a statictext kind label; assert presence, not order.
