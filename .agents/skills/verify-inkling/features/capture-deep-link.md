# Capture by deep link

The app's `inkling://capture?url=...` intake saves the URL as a card at once, then enriches it in the background, like Add > Link. Status: **driven** on 2026-11-05, as a launch argument. Not driven: the OS-level handler (a browser or the shell opening `inkling://`), which only a packaged build registers.

## Sub-features

- `deeplink-launch` a `inkling://capture?url=...` argument at launch saves the URL as a card.
- `deeplink-enrich` the background job replaces the domain title with the page's.

## How to get to it (user POV)

- Another app or a browser opens `inkling://capture?url=...`. In a verification run the same link is given to `launch`.

## Driving it with instance.ts

Preconditions: the machine can reach the URL.

- `$I launch --link "inkling://capture?url=https://example.com/"`. The launcher accepts only a plain `inkling://capture?url=...` value and passes it to Electron as an argument; `main.ts` hands the arguments to the capture intake at startup.
- **Instant proof.** `$I db "SELECT kind,title,source_url FROM items ORDER BY created_at DESC LIMIT 1"` → kind `url`, source_url `https://example.com/`, title `example.com`.
- **Enrichment proof.** Re-run that query until `title` is `Example Domain`. Poll the query; do not assume a delay.
- `$I tree | grep 'Article:'` shows the card, and the sidebar `Everything` link counts it.

## Gotchas

- Only at `launch`: this skill has no route to hand a second link to a running app, and `launch` refuses while a run is live.
- The OS handler is registered only in packaged builds (`apps/desktop/src/capture/outside-captures.ts`), so an unpackaged run never takes `inkling://` from the installed app. Do not add a packaged run to this skill: it opens the user's real library.
- Offline, the card keeps the domain title and the enrichment job fails or retries: check `jobs.status`.
