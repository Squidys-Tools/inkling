# Similar items

An open item's Similar section lists items the library ranks as related. Status: **driven** on 2026-11-19 — populated (a uniquely-named mini-card navigates to its item view) and empty. The seeded library has no `item_embeddings` rows (no ingestion pipeline), so a fresh run shows the empty copy. The viewed item needs its own `item_embeddings` row — `searchSimilar` returns `[]` without one — so a seed item stays empty until it is itself embedded. Three paths embed an item: capturing this run's own items, editing one (`updateItem` re-enqueues `generate_embedding` on title/body/tag changes), and — seed items only — opening an image or PDF, whose empty `ocr_text` enqueues OCR that chains into an embedding only when it finds text — a textless scan never embeds. Populating takes the viewed item's row plus at least one other embedded item; the first `generate_embedding` can download the model into the run's library, so on a networked run the section does populate.

## Sub-features

- `similar-empty` the Similar section renders and shows "Nothing similar yet." when nothing is related.
- `similar-populated` results appear as `button "<title>"` tiles; text-kind tiles carry a kind label (`NOTE`, `ARTICLE`, …).
- Clicking a uniquely-named similar tile navigates to that item's view (driven 2026-11-19). Twin-named tiles still trip the `AMBIGUOUS_TARGET` twin guard, and keyboard `Tab`+`Enter` lands on the item view's `Close` instead — pick a unique name or don't click.

## How to get to it (user POV)

- Open an item card; choose **Similar** in the Item sections row, or scroll — Similar follows Info on the same page.

## Driving it with agent-desktop

Preconditions: seeded library. Similar results lazy-load once the section approaches the fold, and choosing the tab scrolls it in.

- **Open.** `$I ad click "$($I ref group 'Article: The Hundred-Year Language')"`.
- **Go to Similar.** `$I ad click "$($I ref button Similar)"` (inside `navigation "Item sections"`; the active button carries `current` state).
- **Proof.** `$I ad find --name 'Nothing similar yet.'` returns one `statictext` under `group:Similar`. On the Linux box `tree`'s deeper snapshot lists it directly; on Windows `tree` lists only interactive nodes, so `ad find` is the portable probe. `$I shot s1`.

## Gotchas

- With the section off-screen its panel may not have rendered yet; the `Similar` button both scrolls to it and triggers the load.
- A run with real embedding data lists tiles instead — assert presence, not order. Only the generic text tile shows a kind label: a tile with artwork is a bare `<img>` whatever its kind, and a Quote tile shows mark/title/description, so don't grep every tile for `ARTICLE:`/`NOTE:`. Text similarity returns only `article`/`url`/`note`/`quote` kinds (active items); image similarity returns only `image`.
- The section's query is not invalidated by library changes: an empty result rendered before the viewed item's embedding lands stays empty until the item is remounted — close and reopen the item to force the refetch.
