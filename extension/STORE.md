# inkling browser extension — Chrome store prep

## Short description

Save web pages and links to your local inkling library.

## Long description

Save the page you are viewing from the toolbar, or right-click a link or page and choose **Save to inkling**. The extension sends the URL to inkling on this computer. It does not read page content or send anything to a remote service.

## Permissions

- `activeTab` — read the URL and title only after you click the toolbar action or context-menu item.
- `contextMenus` — add **Save to inkling** to links and pages.
- `storage` — keep the optional local receiver address and pairing token in this browser profile.
- `http://127.0.0.1/*` — send paired captures to the inkling receiver on this computer; the receiver requires its per-install bearer token and allows browser-extension origins.

## Privacy note

The extension sends page URLs only. When paired, the token is sent only to `127.0.0.1`; otherwise the extension hands the URL to inkling through its registered `inkling://` capture link. No accounts, analytics, remote calls, or page extraction.

## Load unpacked

1. From the repository root, run `bun run --cwd extension build`.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist/`.
3. Open the loaded extension's **Details → Extension options** to configure the app address and token from inkling's **Settings → Browser extension** panel. Pairing enables direct loopback saves; the capture link remains the fallback when the receiver is unavailable.

## Store checklist

- [ ] Rasterize `icons/inkling.svg` to store-required PNGs (16/48/128 plus promo tiles) at submission time.
- [ ] Confirm the Chrome build loads in Edge unchanged.
- [ ] Add screenshots and review final store copy. Do not publish from this phase.
