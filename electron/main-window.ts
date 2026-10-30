import { app, BrowserWindow, ipcMain, shell } from "electron";
import { createRendererRecovery } from "./renderer-recovery.ts";
import { parseHttpUrlCore } from "../src/lib/deepLinkCore.mjs";
import { customWindowChrome } from "./window-chrome.ts";

export function createMainWindow({ preload, query }: { preload: string; query: string }) {
  const window = new BrowserWindow({
    title: "inkling",
    width: 1280,
    height: 720,
    // 320px matches the body min-width in src/index.css. At 240px high the library grid shrinks to 65px; 360px keeps it near 185px.
    minWidth: 320,
    minHeight: 360,
    ...customWindowChrome,
    autoHideMenuBar: true,
    backgroundColor: "#0c0c0b",
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // HTML-in-Canvas, so liquid glass can refract the live grid. Chromium
      // ships it behind this flag; without it the renderer keeps the CSS glass.
      enableBlinkFeatures: "CanvasDrawElement",
    },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = parseHttpUrlCore(url)?.toString();
    if (externalUrl) void shell.openExternal(externalUrl).catch(() => {});
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, target) => {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      event.preventDefault();
      return;
    }
    if (url.protocol !== "app:" || url.hostname !== "local") event.preventDefault();
  });
  // The renderer calls inkling:window:ready once it knows whether the welcome
  // runs and has painted that first frame, so a first launch never flashes the
  // library before onboarding. The timer only guards against a renderer that
  // never says so: the window must always appear.
  window.once("ready-to-show", () => {
    setTimeout(() => {
      if (!window.isDestroyed() && !window.isVisible()) window.show();
    }, 3000);
  });
  const recovery = createRendererRecovery();
  const recover = async (reason: string) => {
    if (window.isDestroyed()) return;
    console.error(`Inkling renderer recovery: ${reason}`);
    if (recovery.admit()) {
      await window.loadURL(`app://local/index.html${query ? `${query}&` : "?"}safeGraphics=1`);
      return;
    }
    await window.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'\"><style>body{background:#141413;color:#f3f0e8;font:18px system-ui;padding:12vh 10vw}</style><h1>Inkling couldn’t display this view.</h1><p>Your saved library is still on this computer. Reopen Inkling to try again.</p>",
        ),
    );
    window.show();
  };
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") void recover(details.reason).catch(console.error);
  });
  const gpuGone = (_event: Electron.Event, details: Electron.Details) => {
    if (details.type === "GPU") void recover(`GPU ${details.reason}`).catch(console.error);
  };
  app.on("child-process-gone", gpuGone);
  window.once("closed", () => app.off("child-process-gone", gpuGone));
  void window.loadURL(`app://local/index.html${query}`);
  return window;
}

export function registerWindowControls() {
  ipcMain.handle("inkling:window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("inkling:window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("inkling:window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("inkling:window:ready", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && !window.isVisible()) window.show();
  });
}
