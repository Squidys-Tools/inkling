# Similar items

An open item's Similar section lists items the library ranks as related. Status: **driven** on 2026-11-12 — the empty state only. The seeded library has no `item_embeddings` rows (no ingestion pipeline), so the section always shows its empty copy here; a populated row needs a library built by real captures.

## Sub-features

- `similar-empty` the Similar section renders and shows "Nothing similar yet." when nothing is related.
- Not driven: clicking a similar item's tile (needs a populated Similar section).

## How to get to it (user POV)

- Open an item card; choose **Similar** in the Item sections row, or scroll — Similar follows Info on the same page.

## Driving it with agent-desktop

Preconditions: seeded library. Similar results lazy-load once the section approaches the fold, and choosing the tab scrolls it in.

- **Open.** `$I ad click "$($I ref group 'Article: The Hundred-Year Language')"`.
- **Go to Similar.** `$I ad click "$($I ref button Similar)"` (inside `navigation "Item sections"`; the active button carries `current` state).
- **Proof.** `$I tree | grep -i similar` shows the `Similar` section and the text `Nothing similar yet.`. `$I shot s1`.

## Gotchas

- With the section off-screen its panel may not have rendered yet; the `Similar` button both scrolls to it and triggers the load.
- A run with real embedding data lists tiles instead — each is an `aria-label`led tile named by the item title; assert presence, not order.
