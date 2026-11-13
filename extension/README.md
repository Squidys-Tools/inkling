# Save to inkling from Chrome

Click the inkling toolbar icon, or press Alt+Shift+S, to open the save popup. It shows the card the tab will become in your library: an article, video, X post, PDF or image, or a quote when text is selected, with the page offered beside it. Edit the title or the quote's source if you like, then press Enter or **Save**. You can also right-click a page, link, selection or image and choose **Save … to inkling**.

The popup reads the page's title, description, preview image and selection to draw the card. It sends inkling only the URL, title, selected text or image address; inkling extracts and processes the rest in the background.

## Connect to the app

Connecting is optional and takes one click. With inkling open, press **Connect** in the popup (or its settings button, or **Details → Extension options**), then choose **Connect** in the question inkling asks. The popup then shows **Connected to inkling**, and it stays connected across restarts of the app and the browser.

The app listens on the first free port of a short fixed list (`captureReceiverPorts` in `packages/contracts/src/capture.ts`) and the extension tries each, so no address is typed. Approving hands the extension a token, which it sends with every save to `http://127.0.0.1:<port>/v1/captures`. The token stays in this browser profile and is sent only to `127.0.0.1`. **Disconnect** on the extension's page forgets it; **Disconnect browsers** in inkling's **Settings → Browser extension** makes every browser connect again.

Not connected, or when inkling is not running, the extension hands the capture to the app through the `inkling://capture?url=...` link, which carries quotes (`&selection=`) and images (`&image=`) too and can start the app when the operating system has registered the `inkling://` protocol. Both paths save the same way; the extension does not contact a remote service.

## Load unpacked

1. Install the repository dependencies with `bun install`.
2. Build the extension from the repository root: `bun run build:extension`.
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist/`.

The popup gets access to the tab you open it on through `activeTab`, and only then. The loopback host permission is limited to `127.0.0.1`; there are no persistent page scripts or broad website permissions.
