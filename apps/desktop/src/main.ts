import type { ConfirmOptions, ContextMenuItem, Platform } from "@inkling/contracts/desktop";
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { channels } from "./channels.ts";
import { windowBackground, windowChrome } from "./chrome.ts";
import { outsideCaptures } from "./capture/outside-captures.ts";
import { libraryDirectory as resolveLibraryDirectory } from "./data-directory.ts";
import { registerFrameReferer } from "./frame-referer.ts";
import { mainLibraryClient } from "./library-client.ts";
import { installMenu } from "./menu.ts";
import { registerNativeHandlers } from "./native-handlers.ts";
import { startProcesses } from "./processes.ts";
import { createQuitDrain } from "./quit-drain.ts";
import { appUrl, assetsDirectoryOf, handleAppScheme, registerAppScheme } from "./protocol.ts";

const bundleDirectory = dirname(fileURLToPath(import.meta.url));
app.setName("inkling");
// Windows falls back to the exe icon on the taskbar for an unregistered AUMID;
// unpackaged dev windows must inherit electron.exe's AUMID so the window icon shows.
if (process.platform === "win32" && (app.isPackaged || process.env.INKLING_APP_USER_MODEL_ID))
  app.setAppUserModelId(process.env.INKLING_APP_USER_MODEL_ID ?? "com.inkling.library");
if (process.platform === "linux") app.setDesktopName("inkling");
const applicationIconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
const applicationIcon = app.isPackaged
  ? join(process.resourcesPath, applicationIconFile)
  : resolve(bundleDirectory, `../../build/${applicationIconFile}`);
const platform = process.platform as Platform;
const libraryDirectory = resolveLibraryDirectory({
  executablePath: app.getPath("exe"),
  appDataDirectory: app.getPath("appData"),
  portable: app.isPackaged && process.env.INKLING_PORTABLE === "1",
  overrideDirectory: app.commandLine.getSwitchValue("user-data-dir") || undefined,
});
app.setPath("userData", libraryDirectory);
registerAppScheme();
if (platform === "linux") app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
const libraryClient = mainLibraryClient();
const captures = outsideCaptures({ libraryDirectory, library: libraryClient.client });

let mainWindow: BrowserWindow | undefined;
let library: ReturnType<typeof startProcesses> | undefined;

function createWindow() {
  const { options } = windowChrome(platform);
  const window = new BrowserWindow({
    title: "inkling",
    icon: applicationIcon,
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 400,
    ...options,
    backgroundColor: windowBackground,
    show: false,
    webPreferences: {
      preload: join(bundleDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, target) => {
    // Only the app page itself: a stray link in saved HTML must not move the
    // window to another same-origin path, where the preload would load again.
    if (target.split("#")[0] !== appUrl().split("?")[0]) event.preventDefault();
  });
  // The renderer calls `ready` once its first real frame has painted. The
  // timer only covers a renderer that never does: the window must appear.
  window.once("ready-to-show", () => {
    setTimeout(() => {
      if (!window.isDestroyed() && !window.isVisible()) window.show();
    }, 3000);
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  void window.loadURL(appUrl());
  mainWindow = window;
}

function showMainWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

const isWebUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const windowOf = (event: Electron.IpcMainInvokeEvent) =>
  BrowserWindow.fromWebContents(event.sender);

function registerIpc() {
  ipcMain.on(channels.libraryConnect, (event) => library?.attach(event.sender));
  ipcMain.handle(channels.appVersion, () => app.getVersion());
  ipcMain.handle(channels.windowMinimize, (event) => windowOf(event)?.minimize());
  ipcMain.handle(channels.windowToggleMaximize, (event) => {
    const window = windowOf(event);
    if (window?.isMaximized()) window.unmaximize();
    else window?.maximize();
  });
  ipcMain.handle(channels.windowClose, (event) => windowOf(event)?.close());
  ipcMain.handle(channels.windowReady, (event) => {
    const window = windowOf(event);
    if (window && !window.isVisible()) window.show();
    captures.windowReady(event.sender);
  });
  ipcMain.handle(
    channels.contextMenu,
    (event, items: ContextMenuItem[]) =>
      new Promise<string | null>((resolve) => {
        let chosen: string | null = null;
        const menu = Menu.buildFromTemplate(
          items.map((item) =>
            item.type === "separator"
              ? { type: "separator" as const }
              : {
                  label: item.label,
                  enabled: item.enabled ?? true,
                  click: () => {
                    chosen = item.id;
                  },
                },
          ),
        );
        // `callback` runs after the click handler, also when the menu is dismissed.
        menu.popup({
          window: windowOf(event) ?? undefined,
          callback: () => resolve(chosen),
        });
      }),
  );
  ipcMain.handle(channels.confirm, async (event, options: ConfirmOptions) => {
    const window = windowOf(event);
    if (!window) return false;
    const { response } = await dialog.showMessageBox(window, {
      type: options.destructive ? "warning" : "question",
      message: options.message,
      detail: options.detail,
      buttons: [options.confirmLabel, "Cancel"],
      defaultId: options.destructive ? 1 : 0,
      cancelId: 1,
      noLink: true,
    });
    return response === 0;
  });
  ipcMain.handle(channels.showLibraryFolder, async () => {
    const error = await shell.openPath(libraryDirectory);
    if (error) throw new Error(error);
  });
  ipcMain.handle(channels.openExternal, (_event, url: string) => {
    if (!isWebUrl(url)) throw new Error("Only web links open in the browser.");
    return shell.openExternal(url);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    captures.receive(argv);
    showMainWindow();
  });
  // macOS sends links here, also at launch before `ready`, and keeps running with no window.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    captures.receive([url]);
    if (app.isReady()) showMainWindow();
  });

  void app.whenReady().then(() => {
    installMenu((command) => mainWindow?.webContents.send(channels.command, command));
    if (platform === "darwin") app.dock?.setIcon(applicationIcon);
    handleAppScheme({
      rendererDirectory: join(bundleDirectory, "..", "renderer"),
      assetsDirectory: assetsDirectoryOf(libraryDirectory),
    });
    registerFrameReferer(session.defaultSession.webRequest);
    library = startProcesses({
      bundleDirectory,
      libraryDirectory,
      onCannotOpen: (reason) => dialog.showErrorBox("inkling can't open your library", reason),
    });
    library.attachMain(libraryClient.onPort);
    registerIpc();
    const native = registerNativeHandlers({
      libraryDirectory,
      library: libraryClient.client,
      mainWindow: () => mainWindow,
    });
    void captures.start();
    captures.receive(process.argv);
    createWindow();

    // macOS keeps the app running with no window; the Dock icon brings one back.
    app.on("activate", showMainWindow);
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
    app.on(
      "before-quit",
      createQuitDrain(
        async () => {
          // Close admission first, then drain private exports and captures before storage.
          await native.stop();
          await captures.stop();
          await library?.stop();
        },
        () => app.quit(),
        () =>
          dialog.showErrorBox(
            "inkling could not close",
            "Cleanup could not finish. Please try quitting again.",
          ),
      ),
    );
  });
}
