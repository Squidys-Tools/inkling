# Capture a link

Capture a link saves a URL as a card at once, then fills in title and description in the background. Status: **driven** on 2026-11-19. Like the deep-link and receiver captures it fetches the URL (network); this is the networked capture driven through the add tile.

## Sub-features

- `link-instant` the card appears immediately with the domain as its title.
- `link-enrich` a background job fills title and description from the page — the title only while it still equals the capture-time domain placeholder (a title you set or renamed is kept), the description only while empty.

## How to get to it (user POV)

- On Everything, type or paste the URL into the add tile (the grid's first cell) and press Enter. There is no Add > Link: the tile replaced it. (Paste onto the grid and drag and drop: not driven. The deep link and the extension receiver are [capture-deep-link](./capture-deep-link.md) and [capture-extension](./capture-extension.md).)

## Driving it with agent-desktop

Preconditions: seeded library; the machine can reach `https://example.com/`.

- **Fill and save.** On Everything, `$I ad set-value "$($I ref textbox 'Add a note or a link')" 'https://example.com/'`, then `$I ad press return --window-id '{window}'`. The tile empties.
- **Instant proof.** `$I tree | grep -E 'Everything|Article:'` shows `Everything` +1 and group `Article: example.com`; `db "SELECT kind,title,source_url,source_label FROM items ORDER BY created_at DESC LIMIT 1"` → kind `url`, title `example.com`, source_url `https://example.com/`; `metadata` has `captureSource` `add tile`.
- **Enrichment proof.** Re-run the same `db` query until `title` is `Example Domain` (about 5 s); `db "SELECT kind,status FROM jobs ORDER BY created_at DESC LIMIT 4"` lists an `enrich_url` job `completed`. Poll the query; do not assume a fixed delay.

## Gotchas

- The card is named `Article: <title>` for an ordinary page and its title changes after enrichment, so re-resolve it by the current title. A saved video-provider URL (YouTube or Vimeo — the only mapped providers) becomes a `Video:` card instead — don't substitute one into the recipe.
- Offline, the card keeps the domain title (partial result) and the job fails or retries: check `jobs.status`.
- Read `db` before repeating a save so you do not capture twice.
- A link capture queues exactly one job, `enrich_url`; `generate_embedding` is chained after enrichment succeeds — and for a qualifying x.com status URL whose post lacks media a silent `x_post_media` job too. The row stays `kind='url'` even when the card displays as `Video:` (the card kind is display-derived). Links never get a poster job (`video_poster` is for saved video files only). Wait on the specific `enrich_url` row.
