# Capture by the extension receiver

The loopback receiver the browser extension posts to. `POST /v1/captures` with the pairing token saves a capture through the same intake the extension uses. Status: **driven** on 2026-11-05 with `instance.ts capture`. Not driven: the Chrome extension itself (it runs in a real browser).

## Sub-features

- `receiver-url` a page URL posted to the receiver saves as a card and enriches like a link.
- Not driven: a request with a wrong or missing token (expected 401), and a request from a foreign browser origin (expected 403).

## How to get to it (user POV)

- No UI. The app starts the receiver with itself, on a random `127.0.0.1` port, and keeps its bearer token in `pairing_token` in the library directory.

## Driving it with instance.ts

- `$I capture https://example.org/` prints `201 {"id":"..."}`. The helper takes the port from the listening sockets of this run's Electron pid, reads the token from this run's library, probes `/v1/health`, then posts. It never prints the token.
- The body it posts is `{"version":1,"kind":"page","url":...}`. The receiver accepts `page`, `quote` and `image` on input, and a page with no HTML is saved as a bare URL.
- **Proof.** `$I db "SELECT kind,title,source_url FROM items ORDER BY created_at DESC LIMIT 1"` → kind `url`, source_url as posted. `$I tree | grep Everything` shows the count one higher.

## Gotchas

- The helper sends no `Origin` header, which the receiver allows. Browser origins other than the extension's are refused.
- The port changes on every launch; the helper finds it each time, so never record it in evidence or source.
- The token is the scratch library's, and the rule is the same as the app's: keep it out of `PROOF.md` and screenshots.
