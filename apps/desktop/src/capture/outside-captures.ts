import type { FailedCapture } from "@inkling/contracts/desktop";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { join } from "node:path";
import { createScreenshotImporter } from "./screenshot-import.ts";
import { createSingleFlightDirectoryPicker } from "../native-dialog.ts";
import { channels } from "../channels.ts";
import type { LibraryClient } from "../library-client.ts";
import { downloadImage } from "./image-download.ts";
import { deepLinkInbox, saveCapture } from "./save.ts";
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
  // Node's fetch, not net.fetch: it returns a redirect unfollowed, so each hop is checked first.
  const download = (url: string) => downloadImage(url, fetch);
  const receive = deepLinkInbox({
    library,
    downloadImage: download,
    onFailure: (failure) => {
      const live = [...readyWindows].filter((contents) => !contents.isDestroyed());
      if (live.length === 0) pendingFailures.push(failure);
      for (const contents of live) contents.send(channels.captures, [failure]);
    },
  });
  let server: Awaited<ReturnType<typeof startCaptureServer>> | undefined;
  let screenshots: ReturnType<typeof createScreenshotImporter> | undefined;
  const screenshotImporter = () => {
    if (!screenshots) throw new Error("Screenshot import is not ready.");
    return screenshots;
  };
  const trustedScreenshot = (event: IpcMainInvokeEvent) => {
    if (!readyWindows.has(event.sender) || event.senderFrame !== event.sender.mainFrame)
      throw new Error("Only the library window can configure screenshot import.");
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) throw new Error("No library window.");
    return window;
  };
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
      ipcMain.handle(
        channels.captureTestReceiver,
        async () => (await server?.answersHealthCheck()) ?? false,
      );
      screenshots = createScreenshotImporter({
        preferencesPath: join(libraryDirectory, "screenshot-import.json"),
        defaultDirectory: join(app.getPath("pictures"), "Screenshots"),
        save: async (input) => (await library()).saveScreenshot(input),
      });
      const choose = createSingleFlightDirectoryPicker<BrowserWindow>((parent, options) =>
        dialog.showOpenDialog(parent, options),
      );
      ipcMain.handle(channels.screenshotState, (event) => {
        trustedScreenshot(event);
        return screenshotImporter().getState();
      });
      ipcMain.handle(channels.screenshotSetEnabled, (event, enabled: unknown) => {
        trustedScreenshot(event);
        if (typeof enabled !== "boolean") throw new Error("Enabled must be true or false.");
        return screenshotImporter().configure(enabled);
      });
      ipcMain.handle(channels.screenshotChooseDirectory, async (event) => {
        const window = trustedScreenshot(event);
        const directory = await choose(window, "Choose a screenshots folder");
        trustedScreenshot(event);
        const current = await screenshotImporter().getState();
        return directory ? screenshotImporter().configure(current.enabled, directory) : current;
      });
      try {
        server = await startCaptureServer({
          libraryDirectory,
          save: async (capture) => saveCapture(capture, await library(), download),
        });
      } catch (error) {
        console.error("inkling: the browser extension receiver did not start", error);
      }
    },
    stop: async () => {
      await screenshots?.close();
      await server?.close();
    },
  };
}
