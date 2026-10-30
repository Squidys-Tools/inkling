import {
  type CommandArgs,
  type CommandName,
  type CommandResults,
  commandArgs,
} from "@inkling/contracts";
import { commandChannel, commandNames } from "@inkling/contracts/commands";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  protocol,
  session,
  shell,
} from "electron";
import electronUpdater from "electron-updater";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAiJobProcessors, jobTimeouts } from "./ai-jobs.ts";
import { enqueueStaleImageEmbeddings } from "./embedding-jobs.ts";
import {
  allowCanvasReadableImages,
  createAppAssetHandler,
  registerAppScheme,
} from "./app-protocol.ts";
import { createMainWindow, registerWindowControls } from "./main-window.ts";
import { startCaptureServer } from "./capture-server.ts";
import { createLibrarySizeCache } from "./library-size.ts";
import { createSingleFlightDirectoryPicker } from "./native-dialog.ts";
import {
  enqueueDeepLink,
  handleDeepLinkArguments,
  registerDeepLinkSubscriptions,
  takePendingDeepLinks,
} from "./deep-links.ts";
import { createDisplayCaptureHandler } from "./display-capture.ts";
import { snapshotDatabase } from "./sqlite-snapshot.ts";
import {
  JobQueue,
  Library,
  libraryLayer,
  type Promised,
  promised,
  resolveLibraryDataDirectory,
} from "./storage/library.ts";
import { makeWorker } from "./storage/worker.ts";
import { createUpdateController, createUpdatePreferences } from "./updater.ts";
import { installDebianUpdate, updateDisabledReason } from "./update-install.ts";

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
const packageTypePath = join(process.resourcesPath, "package-type");
const packageType = existsSync(packageTypePath)
  ? readFileSync(packageTypePath, "utf8").trim()
  : undefined;
const updateController = createUpdateController({
  autoUpdater,
  currentVersion: app.getVersion(),
  disabledReason: updateDisabledReason({
    isPackaged: app.isPackaged,
    isPreview,
    hasFeed: existsSync(join(process.resourcesPath, "app-update.yml")),
    platform: process.platform,
    appImage: process.env.APPIMAGE,
    packageType,
  }),
  preferences: createUpdatePreferences(join(libraryDirectory, "updates.json")),
  install: async (file, version, sha512) => {
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error("No active app window.");
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "Install inkling update",
      message: `Install inkling ${version}?`,
      detail:
        "inkling will restart after installation. Debian may ask for system authorization. Your library stays on this computer.",
      buttons: ["Cancel", "Install and restart"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) throw new Error("Update installation canceled.");
    if (process.platform === "linux" && packageType === "deb") {
      await installDebianUpdate(file, version, sha512);
      app.relaunch();
      app.quit();
    } else {
      autoUpdater.quitAndInstall(false, true);
    }
  },
});
app.setPath("userData", libraryDirectory);
if (process.platform === "linux")
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
let mainWindow: BrowserWindow | undefined;
let captureServer: Awaited<ReturnType<typeof startCaptureServer>> | undefined;
let aiJobProcessors: ReturnType<typeof createAiJobProcessors> | undefined;
type Storage = {
  runtime: ManagedRuntime.ManagedRuntime<Library | JobQueue, unknown>;
  library: Promised<Library["Service"]>;
  jobs: Promised<JobQueue["Service"]>;
};
let storage: Storage | undefined;
let storageReady: Promise<Storage> | undefined;
const librarySizeCache = createLibrarySizeCache(
  join(libraryDirectory, "library.sqlite3"),
  join(libraryDirectory, "assets"),
);
registerAppScheme();

function emitJobUpdated(itemId: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed())
      window.webContents.send("inkling:job-updated", { itemId });
  }
}

// Opening the library migrates it, hands back jobs a previous run left behind,
// and starts both workers. Disposing the runtime hands any running job back.
async function openStorage(): Promise<Storage> {
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(libraryDirectory, "models"),
    bundledModelDirectory: app.isPackaged ? join(process.resourcesPath, "models") : undefined,
  });
  aiJobProcessors = ai;
  const library = libraryLayer({
    databasePath: join(libraryDirectory, "library.sqlite3"),
    jobQueue: { onUpdated: emitJobUpdated },
    media: {
      createSnapshot: snapshotDatabase,
      createThumbnail: (bytes) =>
        import("./thumbnail.ts").then(({ createImageThumbnail }) => createImageThumbnail(bytes)),
      inspectImage: (bytes) =>
        import("./thumbnail.ts").then(({ inspectImage }) => inspectImage(bytes)),
    },
  });
  const workers = Layer.effectDiscard(
    Effect.gen(function* () {
      const jobs = yield* JobQueue;
      // The single-instance lock means no other process can own a processing job.
      yield* jobs.recoverAfterExclusiveStartup();
      yield* enqueueStaleImageEmbeddings;
      const main = yield* makeWorker({
        processors: ai.processors,
        onIdle: ai.onIdle,
        timeouts: jobTimeouts,
      });
      // New cards wait on thumbnails, so they never queue behind OCR or embeddings.
      const thumbnails = yield* makeWorker({
        processors: ai.thumbnailProcessors,
        timeouts: jobTimeouts,
      });
      yield* Effect.forkScoped(main.run);
      yield* Effect.forkScoped(thumbnails.run);
    }),
  );
  const runtime = ManagedRuntime.make(workers.pipe(Layer.provideMerge(library)));
  const run = <A, E>(effect: Effect.Effect<A, E, Library | JobQueue>) => runtime.runPromise(effect);
  try {
    const [libraryService, jobService] = await run(
      Effect.gen(function* () {
        return [yield* Library, yield* JobQueue] as const;
      }),
    );
    return { runtime, library: promised(libraryService, run), jobs: promised(jobService, run) };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}

function initializeLibraryStorage() {
  storageReady ??= openStorage().then(
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

type CommandHandlers = {
  [C in CommandName]: (args: CommandArgs<C>) => CommandResults[C] | Promise<CommandResults[C]>;
};

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

  for (const command of commandNames) {
    const decode = Schema.decodeUnknownSync(commandArgs[command]);
    const handler = handlers[command] as (args: unknown) => unknown;
    ipcMain.handle(commandChannel(command), (_event, args: unknown) => {
      // The renderer is untrusted, so a payload of the wrong shape never reaches a handler.
      let decoded: unknown;
      try {
        decoded = decode(args ?? {});
      } catch (error) {
        throw new Error(
          `invalid storage input: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      return handler(decoded);
    });
  }

  registerDeepLinkSubscriptions();
  registerWindowControls();
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
    if (process.platform === "linux") {
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
      );
    }
    try {
      captureServer = await startCaptureServer({
        libraryDirectory,
        captureUrl: async (input) => (await initializeLibraryStorage()).library.captureUrl(input),
      });
    } catch (error) {
      console.error(
        `capture server unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
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
        try {
          await captureServer?.close();
        } catch (error) {
          console.error(
            `capture server shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        try {
          // Interrupts both workers, which hand their running jobs back, then closes the database.
          await storage?.runtime.dispose();
        } catch (error) {
          console.error(
            `library shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        try {
          await aiJobProcessors?.close();
        } catch (error) {
          console.error(
            `background jobs shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        quitDrainComplete = true;
        app.quit();
      })();
    });
  });
}
