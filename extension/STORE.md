# inkling browser extension — store prep (draft, Phase 4)

## Short description

Save the current page to your local inkling library in one keystroke. Everything stays on your machine.

## Long description (draft)

inkling is a quiet home for everything worth keeping. This extension adds a save button to your browser: press `Ctrl+Shift+S` (or open the popup) and the page lands in your inkling library on this computer. Capture is instant — the card appears right away while extraction runs in the background. Offline? Saves queue locally and retry when the app is back.

## Permissions

- `storage` — the offline save queue and last-save status in `chrome.storage.local`. Nothing else persists.
- `activeTab` + `scripting` — inject the extractor into the tab you explicitly save, on invoke only. No persistent content scripts.
- `contextMenus` — the "Save page to inkling" right-click entry.
- No host permissions. No `<all_urls>`. The extension only touches the tab you explicitly save, and only talks to the inkling companion on loopback (`127.0.0.1`).

## Privacy note

The token never leaves the machine except to the local inkling companion on loopback (`127.0.0.1`). No accounts, no analytics, no remote calls. Uninstalling the extension removes its local data.

## Load unpacked (dev)

Chrome / Edge (same build, unchanged):

1. Run `bun run build` in `extension/`.
2. Open `chrome://extensions` (Edge: `edge://extensions`), enable Developer mode, choose Load unpacked, pick `dist/` once.
3. After each build, press the extension's **Reload** button. Do not remove and re-import it: Chrome keeps the pairing token and app address in extension storage, and removing the extension clears that data.

Firefox:

1. Assemble `manifest.firefox.json` (renamed to `manifest.json`) with the `dist/` outputs; the Gecko `id` placeholder `save@inkling.local` is finalized at signing time.
2. Open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, pick the `manifest.json`.

## Store checklist (remaining)

- [ ] Rasterize `icons/inkling.svg` to store-required PNGs (16/48/128 + promo tiles) at submission time.
- [ ] Confirm the Chrome build loads in Edge unchanged (load-unpacked pass above).
- [ ] Firefox signing via `web-ext sign`.
- [ ] Safari port — deferred; see the note in `options.js`.
- [ ] Screenshots + final copy review. No store publish from this phase.
