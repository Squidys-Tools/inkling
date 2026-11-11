# Capture a link

Capture a link saves a URL as a card at once, then fills in title and description in the background. Status: **driven** on 2026-11-11. Like the deep-link and receiver captures it fetches the URL (network); this is the networked capture driven through the Add form.

## Sub-features

- `link-instant` the card appears immediately with the domain as its title.
- `link-enrich` a background job replaces the title and description from the page.

## How to get to it (user POV)

- Choose **Add**, then **Link**. (Paste and drag and drop: not driven. The deep link and the extension receiver are [capture-deep-link](./capture-deep-link.md) and [capture-extension](./capture-extension.md).)

## Driving it with agent-desktop

Preconditions: seeded library; the machine can reach `https://example.com/`.

- **Open.** `$I ad expand "$($I ref menubutton Add)"`, then `$I ad click "$($I ref menuitem Link)"`. Route `#/add/link`; textfields `URL to save` and `Title`.
- **Fill and save.** `$I ad set-value "$($I ref textfield 'URL to save')" 'https://example.com/'`, then `$I ad click "$($I ref button 'Save to library')"`.
- **Instant proof.** `$I tree | grep -E 'Everything|Article:'` shows `Everything` +1 and group `Article: example.com`; `db "SELECT kind,title,source_url,source_label FROM items ORDER BY created_at DESC LIMIT 1"` → kind `url`, title `example.com`, source_url `https://example.com/`.
- **Enrichment proof.** Re-run the same `db` query until `title` is `Example Domain` (about 5 s); `db "SELECT kind,status FROM jobs ORDER BY created_at DESC LIMIT 4"` lists an `enrich_url` job `completed`. Poll the query; do not assume a fixed delay.

## Gotchas

- The card is named `Article: <title>` and its title changes after enrichment, so re-resolve it by the current title.
- Offline, the card keeps the domain title (partial result) and the job fails or retries: check `jobs.status`.
- If `ref` fails with the `1175` error after its retries, the form is still open: run it again, and read `db` before repeating a save so you do not capture twice.
- A link capture queues exactly one job, `enrich_url`; `generate_embedding` is chained after enrichment succeeds. Links never get a poster job (`video_poster` is for saved video files only). Wait on the specific `enrich_url` row.
