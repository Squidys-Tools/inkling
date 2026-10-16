import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import electronUpdater from "electron-updater";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeepLinkCaptureCore, parseHttpUrlCore } from "../src/lib/deepLinkCore.mjs";
import { startCaptureServer } from "./capture-server.mjs";
import { createAiJobProcessors, enqueueStaleImageEmbeddings } from "./ai-jobs.mjs";
import { createSingleFlightDirectoryPicker } from "./native-dialog.mjs";
import { createUpdateController } from "./updater.mjs";
import { JobWorker, openLibraryStorage, resolveLibraryDataDirectory } from "./storage.mjs";
import { snapshotDatabase } from "./sqlite-snapshot.mjs";

const mainDirectory = dirname(fileURLToPath(import.meta.url));
const { autoUpdater } = electronUpdater;
const isPreview = process.argv.includes("--preview");
const commandLineDataDirectory = app.commandLine.getSwitchValue("user-data-dir");
const libraryDirectory = resolveLibraryDataDirectory({
  executablePath: app.getPath("exe"),
  appDataDirectory: app.getPath("appData"),
  portable: app.isPackaged && process.env.INKLING_PORTABLE === "1",
  overrideDirectory: commandLineDataDirectory || undefined,
});
const updateController = createUpdateController({
  autoUpdater,
  isPackaged: app.isPackaged,
  platform: process.platform,
});
app.setPath("userData", libraryDirectory);
const deepLinkSubscribers = new Set();
const pendingDeepLinks = [];
let mainWindow;
let libraryStorage;
let jobWorker;
let captureServer;
let aiJobProcessors;

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://platform.twitter.com https://publish.x.com",
].join("; ");

const mimeTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webm": "video/webm",
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false },
  },
]);

function sendDeepLinks(contents, links) {
  if (!contents.isDestroyed() && links.length > 0) {
    contents.send("inkling:deep-link", links);
  }
}

function enqueueDeepLink(value) {
  const capture = parseDeepLinkCaptureCore(value);
  if (!capture) return;

  const subscribers = [...deepLinkSubscribers].filter((contents) => !contents.isDestroyed());
  if (subscribers.length === 0) {
    pendingDeepLinks.push(capture);
    return;
  }
  for (const contents of subscribers) sendDeepLinks(contents, [capture]);
}

function handleDeepLinkArguments(argumentsList) {
  for (const argument of argumentsList) {
    if (argument.startsWith("inkling:")) enqueueDeepLink(argument);
  }
}

function emitJobUpdated(itemId) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed())
      window.webContents.send("inkling:job-updated", { itemId });
  }
}

function initializeLibraryStorage() {
  if (libraryStorage) return libraryStorage.status();
  libraryStorage = openLibraryStorage(join(libraryDirectory, "library.sqlite3"), {
    jobQueue: { onUpdated: emitJobUpdated },
    createSnapshot: snapshotDatabase,
    createThumbnail: (bytes) =>
      import("./thumbnail.mjs").then(({ createImageThumbnail }) => createImageThumbnail(bytes)),
  });
  aiJobProcessors = createAiJobProcessors({
    modelCacheDirectory: join(libraryDirectory, "models"),
    bundledModelDirectory: app.isPackaged ? join(process.resourcesPath, "models") : undefined,
  });
  enqueueStaleImageEmbeddings(libraryStorage);
  jobWorker = new JobWorker(libraryStorage, {
    processors: aiJobProcessors.processors,
    onIdle: aiJobProcessors.onIdle,
  }).start();
  return libraryStorage.status();
}

function requireLibraryStorage() {
  if (!libraryStorage) throw new Error("storage has not been initialized");
  return libraryStorage;
}

async function embedQueryForSearch(query) {
  if (!query || !aiJobProcessors) return null;
  try {
    return await aiJobProcessors.embedQuery(query);
  } catch {
    return null;
  }
}

const chooseLibraryDirectory = createSingleFlightDirectoryPicker({
  getParent: () => mainWindow,
  showOpenDialog: (parent, options) => dialog.showOpenDialog(parent, options),
});

function registerLibraryCommands() {
  const storageCommands = {
    initialize_storage: () => initializeLibraryStorage(),
    list_active_items: () => requireLibraryStorage().listActiveItems(),
    list_archived_items: () => requireLibraryStorage().listArchivedItems(),
    get_item_content: ({ id }) => requireLibraryStorage().getItemContent(id),
    search_items: async ({ query, limit }) => {
      const text = String(query ?? "").trim();
      const queryVector = await embedQueryForSearch(text);
      return requireLibraryStorage().searchItems(query, limit, queryVector);
    },
    search_similar_images: ({ itemId, limit }) =>
      requireLibraryStorage().searchSimilar(itemId, "image", limit),
    search_similar_text: ({ itemId, limit }) =>
      requireLibraryStorage().searchSimilar(itemId, "text", limit),
    list_spaces: () => requireLibraryStorage().listSpaces(),
    create_space: ({ input }) => requireLibraryStorage().createSpace(input),
    delete_space: ({ id }) => requireLibraryStorage().deleteSpace(id),
    update_space: ({ input }) => requireLibraryStorage().updateSpace(input),
    swap_space_positions: ({ firstId, secondId }) =>
      requireLibraryStorage().swapSpacePositions(firstId, secondId),
    list_space_items: async ({ id, limit }) => {
      const storage = requireLibraryStorage();
      const space = storage.getSpace(id);
      const text = space?.kind === "smart" ? String(space.query.text ?? "").trim() : "";
      const queryVector = await embedQueryForSearch(text);
      return storage.listSpaceItems(id, limit, queryVector);
    },
    add_space_item: ({ spaceId, itemId }) => requireLibraryStorage().addSpaceItem(spaceId, itemId),
    remove_space_item: ({ spaceId, itemId }) =>
      requireLibraryStorage().removeSpaceItem(spaceId, itemId),
    list_item_spaces: ({ itemId }) => requireLibraryStorage().listItemSpaces(itemId),
    create_note: ({ input }) => requireLibraryStorage().createNote(input),
    create_quote: ({ input }) => requireLibraryStorage().createQuote(input),
    create_url: ({ input }) => requireLibraryStorage().createUrl(input),
    save_file: ({ input }) => requireLibraryStorage().saveFile(input),
    resolve_asset_path: ({ path }) => requireLibraryStorage().resolveAssetPath(path),
    update_item: ({ input }) => requireLibraryStorage().updateItem(input),
    archive_item: ({ id, archived = true }) => requireLibraryStorage().archiveItem(id, archived),
    delete_item: ({ id }) => requireLibraryStorage().deleteItem(id),
    export_library: ({ destination, timezoneOffsetMinutes }) =>
      requireLibraryStorage().exportLibrary(destination, timezoneOffsetMinutes),
    import_library: ({ exportDirectory }) => requireLibraryStorage().importLibrary(exportDirectory),
    get_jobs_for_items: ({ itemIds }) => requireLibraryStorage().jobs.getForItems(itemIds),
    count_active_jobs: () => requireLibraryStorage().jobs.countActive(),
    enqueue_ocr_job: ({ itemId }) => requireLibraryStorage().jobs.enqueueOcr(itemId),
    retry_processing_job: ({ jobId }) => requireLibraryStorage().jobs.retry(jobId),
    get_capture_status: () =>
      captureServer?.status() ?? { running: false, port: null, healthUrl: null },
    get_pairing_token: () => {
      if (!captureServer) throw new Error("The Electron capture server is unavailable.");
      return captureServer.getPairingToken();
    },
    regenerate_pairing_token: () => {
      if (!captureServer) throw new Error("The Electron capture server is unavailable.");
      return captureServer.regeneratePairingToken();
    },
  };

  for (const [command, handler] of Object.entries(storageCommands)) {
    ipcMain.handle(`inkling:${command}`, (_event, args = {}) => handler(args ?? {}));
  }

  ipcMain.handle("inkling:select_library_directory", (_event, { title }) =>
    chooseLibraryDirectory(title),
  );

  ipcMain.handle("inkling:check_for_updates", () => updateController.checkForUpdates());
  ipcMain.handle("inkling:install_update", (_event, { expectedVersion }) =>
    updateController.installUpdate(expectedVersion),
  );

  ipcMain.handle("inkling:plugin:deep-link|get_current", () => pendingDeepLinks.splice(0));
  ipcMain.handle("inkling:deep-link:subscribe", (event) => {
    deepLinkSubscribers.add(event.sender);
    event.sender.once("destroyed", () => deepLinkSubscribers.delete(event.sender));
    sendDeepLinks(event.sender, pendingDeepLinks.splice(0));
  });
  ipcMain.handle("inkling:deep-link:unsubscribe", (event) => {
    deepLinkSubscribers.delete(event.sender);
  });

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
}

async function serveAppAsset(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const url = new URL(request.url);
  if (url.hostname !== "local") return new Response(null, { status: 404 });

  let requestPath;
  try {
    requestPath = decodeURIComponent(url.pathname);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (requestPath === "/" || requestPath.endsWith("/")) requestPath += "index.html";

  const libraryAssetPrefix = "/library-assets/";
  const isLibraryAsset = requestPath.startsWith(libraryAssetPrefix);
  const assetDirectory = isLibraryAsset
    ? join(app.getPath("userData"), "assets")
    : app.isPackaged
      ? join(app.getAppPath(), "dist")
      : resolve(mainDirectory, "../dist");
  const relativeRequestPath = isLibraryAsset
    ? `/${requestPath.slice(libraryAssetPrefix.length)}`
    : requestPath;
  const filePath = resolve(assetDirectory, `.${relativeRequestPath}`);
  const pathFromRoot = relative(assetDirectory, filePath);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    return new Response(null, { status: 403 });
  }

  try {
    const [realRoot, realFile, fileStat] = await Promise.all([
      realpath(assetDirectory),
      realpath(filePath),
      stat(filePath),
    ]);
    const realRelativePath = relative(realRoot, realFile);
    if (!fileStat.isFile() || realRelativePath.startsWith("..") || isAbsolute(realRelativePath)) {
      return new Response(null, { status: 403 });
    }

    const body = request.method === "HEAD" ? null : await readFile(realFile);
    return new Response(body, {
      headers: {
        "Content-Security-Policy": contentSecurityPolicy,
        "Content-Type": mimeTypes[extname(realFile).toLowerCase()] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "inkling",
    width: 960,
    height: 540,
    // 320px matches the body min-width in src/App.css. At 240px high the library grid shrinks to 65px; 360px keeps it near 185px.
    minWidth: 320,
    minHeight: 360,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#0c0c0b", symbolColor: "#e5ddd2", height: 32 },
    autoHideMenuBar: true,
    backgroundColor: "#0c0c0b",
    show: false,
    webPreferences: {
      preload: join(mainDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = parseHttpUrlCore(url)?.toString();
    if (externalUrl) void shell.openExternal(externalUrl).catch(() => {});
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    let url;
    try {
      url = new URL(target);
    } catch {
      event.preventDefault();
      return;
    }
    if (url.protocol !== "app:" || url.hostname !== "local") event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  const query = isPreview ? "?preview=1" : "";
  void mainWindow.loadURL(`app://local/index.html${query}`);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    handleDeepLinkArguments(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    enqueueDeepLink(url);
  });

  void app.whenReady().then(async () => {
    if (app.isPackaged) app.setAsDefaultProtocolClient("inkling");
    else {
      app.setAsDefaultProtocolClient("inkling", process.execPath, [
        resolve(process.argv[1] ?? "."),
      ]);
    }
    registerLibraryCommands();
    try {
      captureServer = await startCaptureServer({
        libraryDirectory,
        createUrl: (input) => {
          if (!libraryStorage) initializeLibraryStorage();
          return requireLibraryStorage().createUrl(input);
        },
      });
    } catch (error) {
      console.error(
        `capture server unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await protocol.handle("app", serveAppAsset);
    handleDeepLinkArguments(process.argv);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
    let quitDrainStarted = false;
    let quitDrainComplete = false;
    app.on("before-quit", (event) => {
      if (quitDrainComplete) return;
      event.preventDefault();
      if (quitDrainStarted) return;
      quitDrainStarted = true;
      jobWorker?.stop();
      void (async () => {
        try {
          await captureServer?.close();
        } catch (error) {
          console.error(
            `capture server shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        try {
          await aiJobProcessors?.close();
        } catch (error) {
          console.error(
            `background jobs shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        try {
          libraryStorage?.db.close();
        } catch (error) {
          console.error(
            `library shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        quitDrainComplete = true;
        app.quit();
      })();
    });
  });
}
