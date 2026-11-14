# Capture by deep link

The app's `inkling://capture?url=...` intake saves the URL as a card at once, then enriches it in the background, like Add > Link. Status: **driven** on 2026-11-13 (run `mwep52rn-095b`), as a launch argument. Not driven: the OS-level handler (a browser or the shell opening `inkling://`), which only a packaged build registers.

## Sub-features

- `deeplink-launch` a `inkling://capture?url=...` argument at launch saves the URL as a card.
- `deeplink-enrich` the background job replaces the domain title with the page's.

## How to get to it (user POV)

- Another app or a browser opens `inkling://capture?url=...`. In a verification run the same link is given to `launch`.

## Driving it with instance.ts

Preconditions: the machine can reach the URL.

- `$I launch --link "inkling://capture?url=https://example.com/"`. The launcher accepts only a plain `inkling://capture?url=...` value and passes it to Electron as an argument; `main.ts` hands the arguments to the capture intake at startup.
- **Proof.** `$I db "SELECT kind,title,source_url,metadata FROM items ORDER BY created_at DESC LIMIT 1"` → kind `url`, source_url `https://example.com/`, metadata `captureSource` `browser extension` (the label outside url and quote captures get; an image capture writes no captureSource). The title starts as `example.com` and becomes `Example Domain`; on a warm machine enrichment finishes before the first query, so poll until `Example Domain` and do not require seeing the domain title. Enrichment can rewrite `source_url` to the page's canonical URL — `example.com` is canonical to itself, but for a URL that redirects, assert `kind`/`title`/`captureSource`, not the posted `source_url`.
- `$I tree | grep 'Article: Example Domain'` shows the card (the seed already carries several `Article:` cards, so grep the title, not the kind) and the sidebar `Everything` link counts it.

## Gotchas

- The app also parses quote (`&selection=` with `&title=` as attribution) and image (`&image=&alt=`) links (`apps/desktop/src/capture/deep-link.ts`), but `launch --link` only accepts the plain `?url=` form, so those are not driven. A link that does not parse is ignored.
- Only at `launch`: this skill has no route to hand a second link to a running app, and `launch` refuses while a run is live.
- The app's parser also accepts `&title=`, `&selection=` (saves a quote) and `&image=&alt=` (saves an image), all under `inkling://capture`; the launcher's `SAFE_LINK` admits only the plain `?url=` form with a raw unencoded http(s) value (it excludes `%` and `&`), and it can still admit values the app drops (empty `url`, no http(s) scheme). Deep-link and receiver url/quote captures write `metadata.captureSource` `browser extension`, not `quick link`; image captures write none.
- The OS handler is registered only in packaged builds (`apps/desktop/src/capture/outside-captures.ts`), so an unpackaged run never takes `inkling://` from the installed app. Do not add a packaged run to this skill: it opens the user's real library.
- Offline, the card keeps the domain title and the enrichment job fails or retries: check `jobs.status`.
