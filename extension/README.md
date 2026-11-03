# Save to inkling from Chrome

Click the inkling toolbar icon, or press Alt+Shift+S, to open the save popup. It shows the card the tab will become in your library: an article, video, X post, PDF or image, or a quote when text is selected, with the page offered beside it. Edit the title or the quote's source if you like, then press Enter or **Save**. You can also right-click a page, link, selection or image and choose **Save … to inkling**.

The popup reads the page's title, description, preview image and selection to draw the card. It sends inkling only the URL, title, selected text or image address; inkling extracts and processes the rest in the background.

## Connect the local receiver

Pairing is optional. When the extension has the app's receiver address and token, it posts to `http://127.0.0.1:<port>/v1/captures` with the bearer token from inkling's **Settings → Browser extension** panel, and the popup shows **Connected to inkling**. inkling picks a new loopback port each time it starts, so after a restart the popup says inkling isn't answering; copy the new address into the extension's options. Until then, saves go through the capture link. The token stays in this browser profile and is sent only to `127.0.0.1`.

Without pairing, or if the receiver is unavailable, the extension hands the capture to the app through the `inkling://capture?url=...` link, which carries quotes (`&selection=`) and images (`&image=`) too. Both paths save the same way; the extension does not contact a remote service.

To pair, open the popup's settings button (or **Details → Extension options**), copy the listening address and pairing token from inkling's **Settings → Browser extension**, and save them there. If inkling is not running, the capture link can start it when the operating system has registered the `inkling://` protocol.

## Load unpacked

1. Install the repository dependencies with `bun install`.
2. Build the extension from the repository root: `bun run --cwd extension build`.
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist/`.

The popup gets access to the tab you open it on through `activeTab`, and only then. The loopback host permission is limited to `127.0.0.1`; there are no persistent page scripts or broad website permissions.
