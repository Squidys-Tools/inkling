# Pair the browser extension

The browser extension saves the current page from its popup, keyboard shortcut, or page context menu. The desktop app's Settings > Extension panel shows the local receiver, pairing token, and connection test. The extension tries the local receiver first, then falls back to a queued payload and an `inkling://` deep link.

## Sub-features

- `extension-settings` opens the Extension tab in Settings.
- `extension-pairing` shows receiver status and the masked pairing token.
- `extension-token` reveals, copies, and renews the token in the desktop app.
- `extension-health` tests the receiver from the desktop app.
- `extension-page-save` saves a readable page from the popup, shortcut, or page context menu.
- `extension-selection`, `extension-image`, and `extension-video` are registered context-menu routes, but their collector is not loaded by the current manifest.
- `extension-fallback` queues a payload when local delivery fails and uses the deep link when the app is closed.

## How to get to it (user POV)

- Open the installed desktop app, choose `Settings`, then choose `Extension`.
- Reveal the pairing token and enter the receiver address and token in the extension Options page.
- Use the extension's `Save this page` button, `Ctrl+Shift+S`, or `Save page to inkling` in the page context menu.
- Use the extension's selection, image, and video context-menu entries only after the collector is wired into the built extension.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor`. The harness browser launches with extensions disabled, so it can prove only the preview boundary.
- Native pairing and extension delivery need an isolated full app, a built extension, an extension-enabled browser, and access to the Tauri bridge. The current source's manifest does not load the content collector used by selection, image, and video menus.

- **Open the preview boundary.** Click `[aria-label="Settings"]`, wait for `.settings-modal`, and choose `Extension` within `.settings-modal-sidebar`. Wait for `.settings-empty-state` and read `Pairing needs the desktop app.` Save `extension-preview.png`.
- **Desktop pairing panel.** In an isolated full app, open the same tab and assert the receiver status, masked token, `Reveal`, `Copy`, `Renew`, and `Test connection` controls. Reveal the token, test the receiver, renew it, and verify the status and token change. The preview cannot reach these controls.
- **Extension page save.** Build and load the extension in a normal Chrome, Firefox, or Edge profile, pair it with the isolated desktop app, and open a readable HTTP fixture with a unique title. Choose `Save this page`, then use `Ctrl+Shift+S`. Require the popup's saved-title status and a matching card in the desktop library. The harness browser cannot load the extension.
- **Fallback and queue.** Close the desktop app, save a page, and inspect the extension's queued status. Reopen the app and verify the queued page is delivered. This requires the extension-enabled browser and native receiver, not `harness.mjs`.
- **Selection, image, and video menus.** Treat these as unverified on the current build because the manifest and build do not load the collector. Do not infer success from the registered context-menu labels.

## Gotchas

- The preview returns `Pairing needs the desktop app.` because `isTauriRuntime()` is false. That is the expected boundary, not a broken Settings tab.
- The extension stores the receiver address and bearer token locally. Never paste a real token into a transcript or commit it.
- Page extraction uses the extension's isolated scripts and Defuddle. A page that blocks injection or has no usable content reports a failed save.
- The current extension package comments still describe loopback as a later phase, while the background dispatcher calls `postPayloadToLoopback` first. Treat the source behavior, not the stale comment, as authoritative.
- The current manifest does not register `content.js`; the selection, image, and video collectors are not operational in this checkout.
- Never point the native check at the developer's live library. Use an isolated app and a prepared fixture page.
