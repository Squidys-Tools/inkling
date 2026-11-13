# inkling browser extension — Chrome store prep

## Short description

Save pages, links, quotes and images to your local inkling library.

## Long description

Click the toolbar icon to see the card the page will become in inkling: an article, video, post, PDF, image, or a quote of the text you selected. Edit the title, press Enter, and it is in your library. Right-click a page, link, selection or image to save it without the popup. Everything goes to inkling on this computer, never to a remote service.

## Permissions

- `activeTab` — read the open tab only after you open the popup or choose a context-menu item.
- `scripting` — read the page's title, description, preview image and selection to draw the popup's preview card.
- `contextMenus` — add the save items to pages, links, selections and images.
- `storage` — keep the token inkling hands over when you connect, in this browser profile.
- `http://127.0.0.1/*` — find the inkling app on this computer and send it captures; the app hands over its token only after you approve the connection there.

## Privacy note

The popup reads the page's title, description, preview image address and selection to draw its preview, and loads that preview image from the site you are on. It sends inkling only the URL, title, selected text or image address. When connected, the token is sent only to `127.0.0.1`; otherwise the extension hands the capture to inkling through its registered `inkling://` capture link. No accounts, analytics, or remote calls.

## Load unpacked

1. From the repository root, run `bun run --cwd extension build`.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist/`.
3. With inkling open, press **Connect** in the popup and approve it in the app. The capture link remains the fallback when the app is not running.

## Package for upload

From the repository root, run `bun run package:extension`; it builds, then writes `extension/inkling-extension-<version>.zip` (gitignored) with `manifest.json` at the zip root.

## Store checklist

- [x] Icons are PNGs resized from the desktop app's `build/icon.png`; regenerate them when that icon changes.
- [ ] Make the 440×280 promo tile at submission time.
- [ ] Confirm the build in Chromium browsers (Helium and Chrome). Other browsers come after.
- [ ] Add screenshots and review final store copy. Do not publish from this phase.
