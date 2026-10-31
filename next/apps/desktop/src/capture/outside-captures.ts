import type { FailedCapture } from "@inkling/contracts/desktop";
import { app, ipcMain, type WebContents } from "electron";
import { channels } from "../channels.ts";
import type { LibraryClient } from "../library-client.ts";
import { downloadImage } from "./image-download.ts";
import { deepLinkInbox } from "./save.ts";
import { startCaptureServer } from "./server.ts";

/**
 * Captures that come from outside the app: `inkling://` links and the browser
 * extension's loopback receiver. Main saves them itself, so they work with no
 * window open and never open a page; windows see new cards as library changes.
 */
export function outsideCaptures({
  libraryDirectory,
  library,
}: {
  libraryDirectory: string;
  library: () => Promise<LibraryClient>;
}) {
  // A failure with no window to show it waits for the next window that is ready.
  const readyWindows = new Set<WebContents>();
  const pendingFailures: FailedCapture[] = [];
  const receive = deepLinkInbox({
    library,
    // Node's fetch, not net.fetch: it returns a redirect unfollowed, so each hop is checked first.
    downloadImage: (url) => downloadImage(url, fetch),
    onFailure: (failure) => {
      const live = [...readyWindows].filter((contents) => !contents.isDestroyed());
      if (live.length === 0) pendingFailures.push(failure);
      for (const contents of live) contents.send(channels.captures, [failure]);
    },
  });
  let server: Awaited<ReturnType<typeof startCaptureServer>> | undefined;
  const runningServer = () => {
    if (!server) throw new Error("The browser extension receiver is not running.");
    return server;
  };

  return {
    /** Takes the `inkling:` links among launch or second-instance arguments, or a macOS `open-url`. */
    receive(argv: readonly string[]) {
      for (const argument of argv) if (argument.startsWith("inkling:")) void receive(argument);
    },
    windowReady(contents: WebContents) {
      if (!readyWindows.has(contents)) {
        readyWindows.add(contents);
        contents.once("destroyed", () => readyWindows.delete(contents));
      }
      if (pendingFailures.length > 0) contents.send(channels.captures, pendingFailures.splice(0));
    },
    async start() {
      // An unpackaged build must not take `inkling://` from the installed app.
      if (app.isPackaged) app.setAsDefaultProtocolClient("inkling");
      ipcMain.handle(
        channels.captureReceiver,
        () => server?.status() ?? { running: false, port: null },
      );
      ipcMain.handle(channels.capturePairingToken, () => runningServer().getPairingToken());
      ipcMain.handle(channels.captureRegenerateToken, () =>
        runningServer().regeneratePairingToken(),
      );
      try {
        server = await startCaptureServer({
          libraryDirectory,
          captureUrl: async (input) => (await library()).captureUrl(input),
        });
      } catch (error) {
        console.error("inkling: the browser extension receiver did not start", error);
      }
    },
    stop: async () => server?.close(),
  };
}
