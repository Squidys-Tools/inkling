import type { UpdateChannel } from "@inkling/contracts/desktop";
import {
  BrowserWindow,
  desktopCapturer,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  session,
  shell,
} from "electron";
import { channels } from "./channels.ts";
import { createDisplayCaptureHandler } from "./display-capture.ts";
import { resolveLibraryAsset } from "./library-asset.ts";
import type { LibraryClient } from "./library-client.ts";
import { createSingleFlightDirectoryPicker } from "./native-dialog.ts";
import { assetsDirectoryOf } from "./protocol.ts";
import { appUpdates } from "./updates/app-updates.ts";

// The page is untrusted, so every argument it sends is checked before use.
function text(value: unknown, maxLength = 500) {
  if (typeof value !== "string" || value.length > maxLength) throw new Error("Invalid request.");
  return value;
}
function updateChannel(value: unknown): UpdateChannel {
  if (value !== "latest" && value !== "nightly") throw new Error("Unknown update channel.");
  return value;
}
const windowOf = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender);

/** Folder picker, show in folder, updates and screenshots: the bridge calls that need the OS. */
export function registerNativeHandlers({
  libraryDirectory,
  library,
  mainWindow,
}: {
  libraryDirectory: string;
  library: () => Promise<LibraryClient>;
  mainWindow: () => BrowserWindow | undefined;
}) {
  const chooseDirectory = createSingleFlightDirectoryPicker<BrowserWindow>((parent, options) =>
    dialog.showOpenDialog(parent, options),
  );
  ipcMain.handle(channels.chooseDirectory, (event, title: unknown) =>
    chooseDirectory(windowOf(event), text(title)),
  );
  ipcMain.handle(channels.showItemInFolder, async (_event, itemId: unknown) => {
    const item = await (await library()).item({ id: text(itemId) });
    if (!item?.localAssetPath) return;
    const file = await resolveLibraryAsset(
      assetsDirectoryOf(libraryDirectory),
      item.localAssetPath,
    );
    if (!file) throw new Error("This item's file is missing from the library folder.");
    shell.showItemInFolder(file);
  });

  const updates = appUpdates({
    libraryDirectory,
    getWindow: mainWindow,
    onChange: (state) => {
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send(channels.updateChanged, state);
    },
  });
  ipcMain.handle(channels.updateState, () => updates.state());
  ipcMain.handle(channels.updateCheck, () => updates.check());
  ipcMain.handle(channels.updateDownload, () => updates.download());
  ipcMain.handle(channels.updateInstall, () => updates.install());
  ipcMain.handle(channels.updateCancel, () => updates.cancel());
  ipcMain.handle(channels.updateSetChannel, (_event, channel: unknown) =>
    updates.setChannel(updateChannel(channel)),
  );

  session.defaultSession.setDisplayMediaRequestHandler(
    createDisplayCaptureHandler({
      isMainFrame: (frame) => {
        const window = mainWindow();
        return Boolean(window && !window.isDestroyed() && frame === window.webContents.mainFrame);
      },
      getSources: () =>
        desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } }),
      usesPortal: Boolean(
        process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === "wayland",
      ),
      chooseSource: async (names) => {
        const window = mainWindow();
        if (!names.length || !window || window.isDestroyed()) return -1;
        const { response } = await dialog.showMessageBox(window, {
          type: "question",
          title: "Capture a screenshot",
          message: "Choose a screen to save to your library",
          buttons: ["Cancel", ...names],
          defaultId: 0,
          cancelId: 0,
        });
        return response - 1;
      },
    }),
    // macOS 15 and later show their own picker and never call the handler.
    { useSystemPicker: process.platform === "darwin" },
  );
}
