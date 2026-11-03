# inkling browser extension — Chrome store prep

## Short description

Save pages, links, quotes and images to your local inkling library.

## Long description

Click the toolbar icon to see the card the page will become in inkling: an article, video, post, PDF, image, or a quote of the text you selected. Edit the title, press Enter, and it is in your library. Right-click a page, link, selection or image to save it without the popup. Everything goes to inkling on this computer, never to a remote service.

## Permissions

- `activeTab` — read the open tab only after you open the popup or choose a context-menu item.
- `scripting` — read the page's title, description, preview image and selection to draw the popup's preview card.
- `contextMenus` — add the save items to pages, links, selections and images.
- `storage` — keep the optional local receiver address and pairing token in this browser profile.
- `http://127.0.0.1/*` — send paired captures to the inkling receiver on this computer; the receiver requires its per-install bearer token and allows browser-extension origins.

## Privacy note

The popup reads the page's title, description, preview image address and selection to draw its preview, and loads that preview image from the site you are on. It sends inkling only the URL, title, selected text or image address. When paired, the token is sent only to `127.0.0.1`; otherwise the extension hands the capture to inkling through its registered `inkling://` capture link. No accounts, analytics, or remote calls.

## Load unpacked

1. From the repository root, run `bun run --cwd extension build`.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist/`.
3. Open the loaded extension's **Details → Extension options** to configure the app address and token from inkling's **Settings → Browser extension** panel. Pairing enables direct loopback saves; the capture link remains the fallback when the receiver is unavailable.

## Store checklist

- [ ] Rasterize `icons/inkling.svg` to store-required PNGs (16/48/128 plus promo tiles) at submission time.
- [ ] Confirm the Chrome build loads in Edge unchanged.
- [ ] Add screenshots and review final store copy. Do not publish from this phase.
