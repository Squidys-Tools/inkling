import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  Menu,
  protocol,
  session,
  shell,
} from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAiJobProcessors } from "./ai-jobs.ts";
import { createAppUpdates } from "./app-updates.ts";
import { type CommandHandlers, registerCommandHandlers } from "./ipc-commands.ts";
import {
  allowCanvasReadableImages,
  createAppAssetHandler,
  registerAppScheme,
} from "./app-protocol.ts";
import { createMainWindow, registerWindowControls } from "./main-window.ts";
import { startCaptureServer } from "./capture-server.ts";
import { createLibrarySizeCache } from "./library-size.ts";
import { type LibraryRuntime, openLibraryRuntime } from "./library-runtime.ts";
import { createSingleFlightDirectoryPicker } from "./native-dialog.ts";
import {
  enqueueDeepLink,
  handleDeepLinkArguments,
  registerDeepLinkSubscriptions,
  takePendingDeepLinks,
} from "./deep-links.ts";
import { createDisplayCaptureHandler } from "./display-capture.ts";
import { resolveLibraryDataDirectory } from "./storage/library.ts";

const mainDirectory = dirname(fileURLToPath(import.meta.url));
const isPreview = process.argv.includes("--preview");
const commandLineDataDirectory = app.commandLine.getSwitchValue("user-data-dir");
const libraryDirectory = resolveLibraryDataDirectory({
  executablePath: app.getPath("exe"),
  appDataDirectory: app.getPath("appData"),
  portable: app.isPackaged && process.env.INKLING_PORTABLE === "1",
  overrideDirectory: commandLineDataDirectory || undefined,
});
const updateController = createAppUpdates({
  libraryDirectory,
  isPreview,
  getWindow: () => mainWindow,
});
app.setPath("userData", libraryDirectory);
if (process.platform === "linux")
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
let mainWindow: BrowserWindow | undefined;
let captureServer: Awaited<ReturnType<typeof startCaptureServer>> | undefined;
let aiJobProcessors: ReturnType<typeof createAiJobProcessors> | undefined;
let storage: LibraryRuntime | undefined;
let storageReady: Promise<LibraryRuntime> | undefined;
const librarySizeCache = createLibrarySizeCache(
  join(libraryDirectory, "library.sqlite3"),
  join(libraryDirectory, "assets"),
);
registerAppScheme();

const logFailure = (context: string) => (error: unknown) =>
  console.error(`${context}: ${error instanceof Error ? error.message : String(error)}`);

function emitJobUpdated(itemId: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed())
      window.webContents.send("inkling:job-updated", { itemId });
  }
}

function initializeLibraryStorage() {
  aiJobProcessors ??= createAiJobProcessors({
    modelCacheDirectory: join(libraryDirectory, "models"),
    bundledModelDirectory: app.isPackaged ? join(process.resourcesPath, "models") : undefined,
  });
  storageReady ??= openLibraryRuntime({
    databasePath: join(libraryDirectory, "library.sqlite3"),
    ai: aiJobProcessors,
    onJobUpdated: emitJobUpdated,
  }).then(
    (opened) => (storage = opened),
    (error) => {
      storageReady = undefined;
      throw error;
    },
  );
  return storageReady;
}

function requireStorage() {
  if (!storage) throw new Error("storage has not been initialized");
  return storage;
}

async function embedQueryForSearch(query: string) {
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
  const library = () => requireStorage().library;
  const jobs = () => requireStorage().jobs;
  const handlers: CommandHandlers = {
    initialize_storage: async () => (await initializeLibraryStorage()).library.status(),
    get_app_version: () => app.getVersion(),
    get_library_size: async ({ refresh = false }) => {
      await initializeLibraryStorage();
      return librarySizeCache.get({ refresh });
    },
    get_last_export: () => library().getLastExport(),
    show_library_folder: async () => {
      const error = await shell.openPath(libraryDirectory);
      if (error) throw new Error(error);
      return true;
    },
    show_item_in_folder: async ({ id }) => {
      const item = await library().getItem(id);
      if (!item?.localAssetPath) return false;
      shell.showItemInFolder(await library().resolveAssetPath(item.localAssetPath));
      return true;
    },
    list_active_items: () => library().listActiveItems(),
    list_archived_items: () => library().listArchivedItems(),
    get_item: ({ id }) => library().getItem(id),
    get_item_cards: ({ ids }) => library().getItemCards(ids),
    get_change_count: () => library().changeCount(),
    get_item_content: ({ id }) => library().getItemContent(id),
    search_items: async ({ query, limit }) => {
      const queryVector = await embedQueryForSearch(query.trim());
      return library().searchItems(query, limit, queryVector);
    },
    search_similar_images: ({ itemId, limit }) => library().searchSimilar(itemId, "image", limit),
    search_similar_text: ({ itemId, limit }) => library().searchSimilar(itemId, "text", limit),
    list_spaces: () => library().listSpaces(),
    create_space: ({ input }) => library().createSpace(input),
    delete_space: ({ id }) => library().deleteSpace(id),
    update_space: ({ input }) => library().updateSpace(input),
    swap_space_positions: ({ firstId, secondId }) =>
      library().swapSpacePositions(firstId, secondId),
    list_space_items: async ({ id, limit }) => {
      const space = await library().getSpace(id);
      const text = space?.kind === "smart" ? String(space.query.text ?? "").trim() : "";
      return library().listSpaceItems(id, limit, await embedQueryForSearch(text));
    },
    add_space_item: ({ spaceId, itemId }) => library().addSpaceItem(spaceId, itemId),
    remove_space_item: ({ spaceId, itemId }) => library().removeSpaceItem(spaceId, itemId),
    list_item_spaces: ({ itemId }) => library().listItemSpaces(itemId),
    create_note: ({ input }) => library().createNote(input),
    create_quote: ({ input }) => library().createQuote(input),
    capture_url: ({ input }) => library().captureUrl(input),
    save_file: ({ input }) => library().saveFile(input),
    resolve_asset_path: ({ path }) => library().resolveAssetPath(path),
    update_item: ({ input }) => library().updateItem(input),
    archive_item: ({ id, archived = true }) => library().archiveItem(id, archived),
    delete_item: ({ id }) => library().deleteItem(id),
    export_library: ({ destination, timezoneOffsetMinutes }) =>
      library().exportLibrary(destination, timezoneOffsetMinutes),
    import_library: ({ exportDirectory }) => library().importLibrary(exportDirectory),
    get_jobs_for_items: ({ itemIds }) => jobs().getForItems(itemIds),
    count_active_jobs: () => jobs().countActive(),
    get_onboarding_state: async () => ({
      shouldAutoShow: app.isPackaged && !(await library().hasCompletedOnboarding()),
    }),
    complete_onboarding: () => library().completeOnboarding(),
    enqueue_ocr_job: ({ itemId }) => jobs().enqueueOcr(itemId),
    retry_processing_job: ({ jobId }) => jobs().retry(jobId),
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
    select_library_directory: ({ title }) => chooseLibraryDirectory(title),
    get_update_state: () => updateController.getState(),
    set_update_channel: ({ channel }) => updateController.setChannel(channel),
    download_update: ({ expectedVersion }) => updateController.downloadUpdate(expectedVersion),
    cancel_update_download: () => updateController.cancelDownload(),
    check_for_updates: () => updateController.checkForUpdates(),
    install_update: ({ expectedVersion }) => updateController.installUpdate(expectedVersion),
    "plugin:deep-link|get_current": takePendingDeepLinks,
  };

  registerCommandHandlers(handlers);
  registerDeepLinkSubscriptions();
  registerWindowControls();
}

function showMainWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = createMainWindow({
    preload: join(mainDirectory, "preload.cjs"),
    query: isPreview ? "?preview=1" : "",
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    handleDeepLinkArguments(argv);
    if (mainWindow) showMainWindow();
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
    // macOS routes Cmd+C, V, W and Q through the app menu; Electron's default also adds reload and DevTools.
    if (process.platform === "darwin")
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: "appMenu" },
          { role: "fileMenu" },
          { role: "editMenu" },
          { role: "windowMenu" },
        ]),
      );
    if (process.platform === "linux" || process.platform === "darwin") {
      session.defaultSession.setDisplayMediaRequestHandler(
        createDisplayCaptureHandler({
          isMainFrame: (frame) =>
            Boolean(
              mainWindow && !mainWindow.isDestroyed() && frame === mainWindow.webContents.mainFrame,
            ),
          getSources: () =>
            desktopCapturer.getSources({
              types: ["screen"],
              thumbnailSize: { width: 0, height: 0 },
            }),
          usesPortal: Boolean(
            process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === "wayland",
          ),
          chooseSource: async (names) => {
            if (!names.length || !mainWindow || mainWindow.isDestroyed()) return -1;
            const { response } = await dialog.showMessageBox(mainWindow, {
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
    try {
      captureServer = await startCaptureServer({
        libraryDirectory,
        captureUrl: async (input) => (await initializeLibraryStorage()).library.captureUrl(input),
      });
    } catch (error) {
      logFailure("capture server unavailable")(error);
    }
    // The bundled main process runs from dist/electron, beside the renderer build.
    await protocol.handle(
      "app",
      createAppAssetHandler(
        app.isPackaged ? join(app.getAppPath(), "dist") : resolve(mainDirectory, ".."),
      ),
    );
    allowCanvasReadableImages();
    handleDeepLinkArguments(process.argv);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    // macOS stays running with no window and sends links here, not to a second instance.
    app.on("open-url", showMainWindow);
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
      void (async () => {
        await captureServer?.close().catch(logFailure("capture server shutdown failed"));
        // Interrupts both workers, which hand their running jobs back, then closes the database.
        await storage?.runtime.dispose().catch(logFailure("library shutdown failed"));
        await aiJobProcessors?.close().catch(logFailure("background jobs shutdown failed"));
        quitDrainComplete = true;
        app.quit();
      })();
    });
  });
}
