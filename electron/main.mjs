import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeepLinkCaptureCore, parseHttpUrlCore } from "../src/lib/deepLinkCore.mjs";

const mainDirectory = dirname(fileURLToPath(import.meta.url));
const isPreview = process.argv.includes("--preview");
const deepLinkSubscribers = new Set();
const pendingDeepLinks = [];
let mainWindow;

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

function registerLibraryCommands() {
  const commandNames = [
    "check_for_updates",
    "install_update",
    "initialize_storage",
    "list_active_items",
    "list_archived_items",
    "get_item_content",
    "search_items",
    "search_similar_images",
    "search_similar_text",
    "list_spaces",
    "create_space",
    "delete_space",
    "update_space",
    "swap_space_positions",
    "list_space_items",
    "add_space_item",
    "remove_space_item",
    "list_item_spaces",
    "create_note",
    "create_quote",
    "create_url",
    "save_file",
    "resolve_asset_path",
    "update_item",
    "archive_item",
    "delete_item",
    "export_library",
    "import_library",
    "get_jobs_for_items",
    "count_active_jobs",
    "enqueue_ocr_job",
    "retry_processing_job",
    "get_capture_status",
    "get_pairing_token",
    "regenerate_pairing_token",
  ];

  for (const command of commandNames) {
    ipcMain.handle(`inkling:${command}`, () => {
      const area =
        command === "check_for_updates" || command === "install_update"
          ? "updates"
          : "native services";
      throw new Error(`The Electron ${area} command "${command}" is not implemented yet.`);
    });
  }

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
    width: 1000,
    height: 800,
    minWidth: 1000,
    minHeight: 800,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: true,
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
    await protocol.handle("app", serveAppAsset);
    handleDeepLinkArguments(process.argv);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
  });
}
