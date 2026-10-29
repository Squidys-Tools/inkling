# Save to inkling from Chrome

Click the inkling toolbar icon to save the current page URL. You can also right-click a link or the page and choose **Save to inkling**. The extension sends the URL and its title; inkling handles extraction and processing in the background.

## Connect the local receiver

Pairing is optional. When the extension has the app's receiver address and token, it posts to `http://127.0.0.1:<port>/v1/captures` with the bearer token from inkling's **Settings → Browser extension** panel. The server chooses an available loopback port when inkling starts, so update the address in the extension's options if that port changes. The token stays in this browser profile and is sent only to `127.0.0.1`.

Without pairing, or if the receiver is unavailable, the extension hands the URL to the app through the existing `inkling://capture?url=...` link. Both paths use inkling's existing URL-capture behavior; the extension does not read page content or contact a remote service.

To pair, open the extension's **Details → Extension options**, copy the listening address and pairing token from inkling's **Settings → Browser extension**, and save them there. If inkling is not running, the capture link can start it when the operating system has registered the `inkling://` protocol.

## Load unpacked

1. Install the repository dependencies with `bun install`.
2. Build the extension from the repository root: `bun run --cwd extension build`.
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist/`.

The manifest grants access to the active tab only after a save action. Its loopback host permission is limited to `127.0.0.1`; there are no persistent page scripts or broad website permissions.
