# Capture by the extension receiver

The loopback receiver the browser extension posts to. `POST /v1/captures` with the pairing token saves a capture through the same intake the extension uses. Status: **driven** on 2026-11-13 with `instance.ts capture`, raw HTTP to the discovered port, and the pairing flow. Not driven: the Chrome extension itself (it runs in a real browser), and the auth-gated body checks (415/413/422) that sit behind a valid token.

## Sub-features

- `receiver-url` a page URL posted to the receiver saves as a card and enriches like a link.
- `receiver-gates` wrong/missing token 401s, a foreign browser origin or a non-loopback Host 403s (Origin is checked before auth, so foreign+bad gets 403), and OPTIONS preflights answer 204.
- `receiver-pair` `POST /v1/pair` from an extension origin asks the user, and `GET /v1/pair/<id>` polls the answer.

## How to get to it (user POV)

- No UI. The app starts the receiver with itself, on the first free `127.0.0.1` port of `captureReceiverPorts` (`packages/contracts/src/capture.ts`) or any free port when all are taken, and keeps its bearer token in `pairing_token` in the library directory.

## Driving it with instance.ts

- `$I capture https://example.org/` prints `201 {"id":"..."}`. The helper takes the port from the listening sockets of this run's Electron pid, reads the token from this run's library, probes `/v1/health` (which also needs the token), then posts. It never prints the token.
- The body it posts is `{"version":1,"kind":"page","url":...}`. The receiver accepts `page`, `quote` and `image` on input; a `page` always reduces to a bare `url` capture (`title` optional, `defuddledHtml` ≤2 MB checked then discarded — the other fields such as `author`/`publishedDate` are validated too and a bad one 422s, all under the 5 MB body cap), so the saved row is kind `url` with `metadata.captureSource` `browser extension` and an `enrich_url` job.
- **Proof.** `$I db "SELECT kind,title,source_url FROM items ORDER BY created_at DESC LIMIT 1"` → kind `url`, source_url as posted after normalization (bare hosts gain a trailing slash); with network the title is usually already enriched (`Example Domain`) by then. `$I tree | grep Everything` shows the count one higher.

## Gotchas

- The helper sends no `Origin` header, which the receiver allows — as do `Origin: null` (what real `file://` pages send), `app://local`, `inkling://` and the `chrome-extension://`/`moz-extension://`/`safari-web-extension://` schemes (the bearer token is the real gate). Any other origin string gets 403 — and a foreign origin with a bad token gets 403, not 401, since the Origin check runs first; OPTIONS preflights answer 204 and carry CORS headers (`Access-Control-Allow-Origin` echoing an allowed origin, `Access-Control-Allow-Methods`, `Access-Control-Max-Age: 600`), so they are not bare. `source_url` is normalized on save (a `#fragment` is dropped). The receiver rate-limits to 60 requests a minute (429 with `Retry-After: 60`), so never loop `$I capture` in a script.
- The port depends on what else is running (another inkling takes the first one); the helper finds it each time, so never record it in evidence.
- Every request needs `Host: 127.0.0.1:<port>`, or it gets 403 before anything else.
- Pairing: `POST /v1/pair` from an extension origin (a web origin like `https://…` gets 403) opens a **Connect the browser extension?** question — GTK-native on Linux, so `dialog check`/`dialog press` sees it — and answers `202 {"id":…}`; `GET /v1/pair/<id>` answers `pending`, then once `approved` (with the token) or `denied`. A second `POST` while a request is still pending cancels that request: it returns `409 pairing-cancelled`, the first request's next `GET` reads `denied`, and after any final status the id is gone — every `GET` then 404s. The question's default focus is Cancel, so a bare Enter denies; approve by navigating to Connect.
- The token is the scratch library's, and the rule is the same as the app's: keep it out of `PROOF.md` and screenshots.
