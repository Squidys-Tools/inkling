import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Toaster, toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive01Icon,
  Database02Icon,
  Download04Icon,
  Grid2X2Icon,
  Link01Icon,
  Loading01Icon,
  PlayIcon,
  RotateCwIcon,
  Settings01Icon,
  SidebarLeftIcon,
  Cancel01Icon,
  Folder01Icon,
  Upload04Icon,
  LicenseThirdPartyIcon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import {
  retryProcessingJob,
  getCaptureStatus,
  getPairingToken,
  regeneratePairingToken,
  isDesktopRuntime,
  isElectronRuntime,
  type CaptureStatus,
  type StoredSpace,
} from "./lib/libraryApi";
import { ArchiveGrid } from "./components/ArchiveGrid";
import { FirstRunOverlay } from "./components/FirstRunOverlay";
import { ContextMenu } from "./components/ContextMenu/ContextMenu";
import { OpenSourceLicenses } from "./components/OpenSourceLicenses/OpenSourceLicenses";
import { SegmentedControl } from "./components/SegmentedControl/SegmentedControl";
// Below-the-fold / on-demand surfaces stay off the boot bundle and load from
// local disk on first open (Suspense fallback null: no spinner, no layout
// shift — the chunk resolves in milliseconds).
const PdfViewer = lazy(() => import("./components/PdfViewer"));
const MascotBoard = lazy(() =>
  import("./components/mascot/MascotBoard").then((module) => ({ default: module.MascotBoard })),
);
const AliveBoard = lazy(() =>
  import("./components/mascot/AliveBoard").then((module) => ({ default: module.AliveBoard })),
);

const ExpandedItemOverlay = lazy(() =>
  import("./components/ExpandedItemOverlay").then((module) => ({
    default: module.ExpandedItemOverlay,
  })),
);
import type { ExpandedOverlayActions } from "./components/ExpandedItemOverlay";
const ReaderView = lazy(() =>
  import("./ReaderView").then((module) => ({ default: module.ReaderView })),
);
import type { ReaderItem } from "./ReaderView";
import type { ItemKind, LibraryItem } from "./lib/types";
import { shouldUseSeedLibrary } from "./lib/previewMode";
import "./App.css";
import { AddMenu } from "./features/capture/AddMenu/AddMenu";
import { CaptureBar } from "./features/capture/CaptureBar";
import { ShortcutsDialog } from "./features/capture/ShortcutsDialog";
import { useCapture } from "./features/capture/useCapture";
import { useItemDetails, showItemInFolderFromOverlay } from "./features/item-view/useItemDetails";
import { useItemSelection } from "./features/item-view/useItemSelection";
import { LibraryCard, type LibraryCardContext } from "./features/library/LibraryCard";
import { LibraryStage } from "./features/library/LibraryStage";
import { useCardMenu } from "./features/library/useCardMenu";
import { useLibraryData } from "./features/library/useLibraryData";
import { useLibraryView } from "./features/library/useLibraryView";
import { ViewDock } from "./features/library/ViewDock";
import { APPEARANCE_OPTIONS } from "./features/settings/appearance";
import {
  formatByteSize,
  formatExportSummary,
  formatImportSummary,
  formatLastCopy,
} from "./features/settings/format";
import { useArchive } from "./features/settings/useArchive";
import {
  showLibraryFolderFromSettings,
  useLibraryTransfer,
} from "./features/settings/useLibraryTransfer";
import { useSettings } from "./features/settings/useSettings";
import { NavRow, navLabelClass, Sidebar, SidebarError } from "./features/shell/Sidebar";
import { SidebarEdgeGrip, SidebarOpenButton } from "./features/shell/SidebarToggles";
import { SpacesSection } from "./features/shell/SpacesSection";
import { TitleBar } from "./features/shell/TitleBar";
import { useAppShortcuts } from "./features/shell/useAppShortcuts";
import { useAppUpdate } from "./features/shell/useAppUpdate";
import { useFirstRun } from "./features/shell/useFirstRun";
import { useHistory } from "./features/shell/useHistory";
import { useMascotMood } from "./features/shell/useMascotMood";
import { useSidebarOpen } from "./features/shell/useSidebarOpen";
import { itemMatchesSmartQuery } from "./features/spaces/smartQuery";
import { useSpaces } from "./features/spaces/useSpaces";
import { TooltipLayer } from "./ui/Tooltip";

// Pairing panel inside the existing Settings modal. Shows the per-install
// pairing token for the browser extension (reveal-on-click, never rendered
// by default) with copy, renew, and a live check against /v1/health.
function ExtensionPairing() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isConfirmingRenew, setIsConfirmingRenew] = useState(false);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void getCaptureStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!isDesktopRuntime()) {
    return (
      <div className="settings-empty-state">
        <div className="settings-empty-icon">
          <HugeiconsIcon icon={Link01Icon} size={19} />
        </div>
        <h4>Pairing needs the desktop app.</h4>
        <p>Open Settings in the installed app to pair the browser extension.</p>
      </div>
    );
  }

  const revealToken = () => {
    if (isRevealed) {
      setIsRevealed(false);
      setToken(null);
      return;
    }
    void getPairingToken()
      .then((value) => {
        setToken(value);
        setIsRevealed(true);
      })
      .catch(() => toast.error("Could not load the pairing token.", { duration: 5000 }));
  };

  const copyToken = () => {
    if (!token) return;
    void navigator.clipboard
      .writeText(token)
      .then(() => toast.success("Pairing token copied. Paste it into the extension."))
      .catch(() =>
        toast.error("Copy failed. Reveal the token and copy it by hand.", { duration: 5000 }),
      );
  };

  const renewToken = () => {
    setIsConfirmingRenew(false);
    void regeneratePairingToken()
      .then((value) => {
        setToken(value);
        setIsRevealed(true);
        toast.success("New pairing token issued. Update the extension.");
      })
      .catch(() => toast.error("Could not renew the pairing token.", { duration: 5000 }));
  };

  const testConnection = () => {
    const healthUrl = status?.healthUrl;
    if (!healthUrl || isTesting) return;
    setIsTesting(true);
    const check = async () => {
      const bearer = token ?? (await getPairingToken());
      const response = await fetch(healthUrl, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    };
    void check()
      .then(() => toast.success("Extension receiver is reachable."))
      .catch(() =>
        toast.error("No answer from the receiver. Is the app running?", { duration: 5000 }),
      )
      .finally(() => setIsTesting(false));
  };

  return (
    <div className="settings-pairing">
      <p className="settings-panel-note">
        Paste this token into the browser extension once. Saves go straight to this library over a
        local connection; nothing leaves the machine.
      </p>
      <div className="settings-pairing-row">
        <span className="settings-pairing-status" role="status">
          {status
            ? status.running
              ? `Listening on 127.0.0.1:${status.port}`
              : "Receiver not running"
            : "Checking receiver…"}
        </span>
        <button
          type="button"
          className="settings-batch-button"
          disabled={!status?.healthUrl || isTesting}
          onClick={testConnection}
        >
          {isTesting ? "Testing…" : "Test connection"}
        </button>
      </div>
      <div className="settings-pairing-row">
        <span className="visually-hidden">
          {isRevealed ? "Pairing token" : "Pairing token hidden"}
        </span>
        <code className="settings-token" aria-hidden={!isRevealed}>
          {isRevealed && token ? token : "••••••••••••••••••••••••"}
        </code>
        <button type="button" className="settings-batch-button" onClick={revealToken}>
          {isRevealed ? "Hide" : "Reveal"}
        </button>
        <button
          type="button"
          className="settings-batch-button"
          disabled={!isRevealed || !token}
          onClick={copyToken}
        >
          Copy
        </button>
        <button
          type="button"
          className="settings-batch-button settings-batch-delete"
          onClick={() => setIsConfirmingRenew(true)}
        >
          Renew
        </button>
      </div>
      {isConfirmingRenew && (
        <section className="settings-confirm" aria-label="Renew the pairing token">
          <p>Renew the pairing token? The extension will need the new token.</p>
          <div className="settings-confirm-actions">
            <button
              type="button"
              className="settings-batch-button"
              onClick={() => setIsConfirmingRenew(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-batch-button settings-batch-delete"
              onClick={renewToken}
            >
              Renew
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// Library makeup for Settings: how many things are kept, split by kind.
const MAKEUP_GROUPS: Array<{ label: string; kinds: ItemKind[]; color: string }> = [
  { label: "Images", kinds: ["Image"], color: "#B0714F" },
  { label: "Articles", kinds: ["Article"], color: "#C9A57A" },
  { label: "PDFs", kinds: ["PDF"], color: "#7E9A86" },
  { label: "Notes & quotes", kinds: ["Note", "Quote"], color: "#8B93B5" },
  { label: "Videos & posts", kinds: ["Video", "Post"], color: "#A88AAE" },
  { label: "Files", kinds: ["File"], color: "#4A443E" },
];

function LibraryMakeup({
  kinds,
  sizeBytes,
  onShowFolder,
}: {
  kinds: ItemKind[];
  sizeBytes: number | null;
  onShowFolder?: () => void;
}) {
  const groups = MAKEUP_GROUPS.map((group) => ({
    ...group,
    count: kinds.filter((kind) => group.kinds.includes(kind)).length,
  })).filter((group) => group.count > 0);
  return (
    <div className="settings-makeup">
      <div className="settings-makeup-head">
        <div className="settings-makeup-figures">
          <p className="settings-makeup-total">
            {kinds.length.toLocaleString()} {kinds.length === 1 ? "thing" : "things"}
          </p>
          {sizeBytes !== null && (
            <span className="settings-makeup-size">{formatByteSize(sizeBytes)} on disk</span>
          )}
        </div>
        {onShowFolder && (
          <button type="button" className="settings-makeup-folder" onClick={onShowFolder}>
            <HugeiconsIcon icon={Folder01Icon} size={13} />
            Show folder
          </button>
        )}
      </div>
      {groups.length > 0 && (
        <>
          <div className="settings-makeup-bar" aria-hidden="true">
            {groups.map((group) => (
              <span key={group.label} style={{ flexGrow: group.count, background: group.color }} />
            ))}
          </div>
          <ul className="settings-makeup-legend">
            {groups.map((group) => (
              <li key={group.label}>
                <span style={{ background: group.color }} aria-hidden="true" />
                {group.label} {group.count.toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function App() {
  const canUseDesktopBackend = isDesktopRuntime() && !shouldUseSeedLibrary();
  const canUseLibraryFolderPicker = isDesktopRuntime() && !shouldUseSeedLibrary();
  const [query, setQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeView, setActiveView] = useState("Everything");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const selectedItemId = selectedItem ? String(selectedItem.id) : null;
  const [isSidebarOpen, setIsSidebarOpen] = useSidebarOpen();
  const { isFirstRunOpen, setIsFirstRunOpen, finishFirstRun } = useFirstRun(canUseDesktopBackend);
  const { availableUpdate, isInstallingUpdate, updateInstallFailed, handleInstallUpdate } =
    useAppUpdate(canUseDesktopBackend);
  const { items, setItems, itemsRef, activeJobCount, debouncedQuery, noteBodyCacheRef, reload } =
    useLibraryData({
      canUseDesktopBackend,
      query,
      activeSpaceId,
      setSelectedItem,
      setCaptureError,
    });
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    settingsTab,
    setSettingsTab,
    isArchiveTabOpen,
    appearance,
    setAppearanceOption,
    appVersion,
    librarySizeBytes,
    wholeLibraryKinds,
    lastCopy,
    setLastCopy,
    settingsDialogRef,
  } = useSettings({ canUseDesktopBackend, activeSpaceId, debouncedQuery });
  const {
    archivedItems,
    setArchivedItems,
    isArchiveLoaded,
    setIsArchiveLoaded,
    isArchiveSelectionMode,
    selectedArchivedIds,
    forgetItem,
    deleteArchivedLibraryItem,
    toggleArchiveSelectionMode,
    toggleArchivedLibraryItem,
    isArchivedLibraryItemSelected,
    restoreSelectedArchivedItems,
    restoreArchivedLibraryItem,
    deleteSelectedArchivedItems,
  } = useArchive({
    canUseDesktopBackend,
    isSettingsOpen,
    isArchiveTabOpen,
    setItems,
    itemsRef,
    noteBodyCacheRef,
    selectedItem,
    setSelectedItem,
    setCaptureError,
  });
  const {
    pdfViewerItem,
    setPdfViewerItem,
    readingItem,
    openReader,
    closeReader,
    addTagToItem,
    updateNote,
    loadSimilarLibraryItems,
    similarItemCacheRef,
  } = useItemDetails({
    canUseDesktopBackend,
    selectedItem,
    setSelectedItem,
    setItems,
    setArchivedItems,
    noteBodyCacheRef,
    setCaptureError,
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const libraryScrollRef = useRef<HTMLDivElement>(null);
  const captureBarRef = useRef<HTMLElement>(null);
  const viewDockRef = useRef<HTMLDivElement>(null);
  const tooltipLayerRef = useRef<HTMLDivElement>(null);
  const cardMenuLayerRef = useRef<HTMLDivElement>(null);
  const libraryFrameRef = useRef<HTMLElement>(null);
  const filteredItemsRef = useRef<LibraryItem[]>([]);
  const {
    selectionRectsRef,
    selectionScrollRef,
    selectLibraryItem,
    selectArchivedLibraryItem,
    bringHistoryCardIntoView,
    openSimilarItem,
  } = useItemSelection({
    libraryScrollRef,
    captureBarRef,
    filteredItemsRef,
    selectedItem,
    setSelectedItem,
  });

  const retryJob = useCallback(async (jobId: string) => {
    setCaptureError(null);
    try {
      const retried = await retryProcessingJob(jobId);
      if (!retried) setCaptureError("That processing job is no longer available to retry.");
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  function selectSpace(space: StoredSpace) {
    setActiveSpaceId(space.id);
    setActiveView(space.name);
    setQuery("");
    setSelectedItem(null);
  }

  function clearToDefaultView() {
    setActiveSpaceId(null);
    setActiveView("Everything");
  }

  const {
    spaces,
    setSpaces,
    activeSpace,
    selectedItemSpaces,
    localSpaceItems,
    isCreatingSpace,
    setIsCreatingSpace,
    newSpaceName,
    setNewSpaceName,
    newSpaceKind,
    setNewSpaceKind,
    newSpaceNameInputRef,
    renamingSpaceId,
    setRenamingSpaceId,
    renameDraft,
    setRenameDraft,
    spaceRenameInputRef,
    sidebarActionError,
    setSidebarActionError,
    beginSaveSearch,
    handleCreateSpace,
    handleToggleItemInSpace,
    handleDeleteSpace,
    handleRenameSpace,
    handleCycleSpaceColor,
    handleMoveSpace,
  } = useSpaces({
    canUseDesktopBackend,
    query,
    activeSpaceId,
    selectedItemId,
    reload,
    selectSpace,
    clearToDefaultView,
    setActiveView,
    setCaptureError,
  });
  const {
    isExportingLibrary,
    lastExport,
    isImportingLibrary,
    lastImport,
    exportLibraryToFolder,
    importLibraryFromFolder,
  } = useLibraryTransfer({
    canUseLibraryFolderPicker,
    setLastCopy,
    setSpaces,
    setArchivedItems,
    setIsArchiveLoaded,
    reload,
    setCaptureError,
  });
  const { listMode, viewSelectionListMode, switchLibraryView, gridColumnCount } =
    useLibraryView(libraryScrollRef);
  const {
    isAdding,
    captureMode,
    setCaptureMode,
    isCapturing,
    isDragActive,
    openCapture,
    closeCaptureModal,
    saveFromAddMenu,
    persistText,
    persistArticle,
    persistQuote,
    captureFile,
    startScreenshotCapture,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useCapture({
    canUseDesktopBackend,
    setItems,
    setSelectedItem,
    setCaptureError,
    setIsSidebarOpen,
  });
  const { isShortcutsOpen, setIsShortcutsOpen } = useAppShortcuts({
    searchRef,
    readingItem,
    selectedItem,
    pdfViewerItem,
    isSettingsOpen,
    setIsSettingsOpen,
    isAdding,
    isCapturing,
    captureMode,
    setCaptureMode,
    openCapture,
    closeCaptureModal,
    setIsSidebarOpen,
  });

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalizedQuery
        ? true
        : canUseDesktopBackend || activeSpace
          ? true
          : [item.title, item.description, item.source, item.kind, ...item.tags]
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery);
      const matchesView =
        activeView === "Everything" ||
        (activeSpace
          ? canUseDesktopBackend
            ? true
            : activeSpace.kind === "regular"
              ? // Mirror of the core's membership read for browser (seed) mode.
                (localSpaceItems.get(activeSpace.id)?.has(String(item.id)) ?? false)
              : itemMatchesSmartQuery(item, activeSpace.query)
          : false);
      return matchesQuery && matchesView;
    });
  }, [activeSpace, activeView, canUseDesktopBackend, items, localSpaceItems, query]);
  filteredItemsRef.current = filteredItems;
  // Both sit under the toolbar in one column, so a capture error and the pinned
  // query row stack instead of overlapping.
  const showFilterRow = !isSearchFocused && query.trim() !== "";
  // A pinned query has its own band above the grid, so the grid starts below it.
  // Only this boolean reaches the DOM, so typing does not restyle the grid.
  const hasPinnedQuery = showFilterRow;
  // An empty Space has nothing to search or re-lay out, so it drops the
  // browsing controls.
  const isEmptySpace = Boolean(activeSpace) && filteredItems.length === 0 && !query.trim();
  const showBrowseControls = !isEmptySpace;
  const showCaptureError = Boolean(captureError) && !isAdding;

  const { cardMenu, closeCardMenu, openCardMenu, cardMenuEntries } = useCardMenu({
    canUseDesktopBackend,
    openReader,
    forgetItem,
  });

  const libraryCardContext = useMemo<LibraryCardContext>(
    () => ({
      layout: listMode ? "list" : "grid",
      onSelectItem: selectLibraryItem,
      onOpenReader: openReader,
      onRetryJob: retryJob,
      onOpenMenu: openCardMenu,
    }),
    [listMode, openCardMenu, openReader, retryJob, selectLibraryItem],
  );

  const archivedCardContext = useMemo<LibraryCardContext>(
    () => ({
      layout: "archive",
      onSelectItem: selectArchivedLibraryItem,
      onOpenReader: openReader,
      onRetryJob: retryJob,
      onDeleteArchivedItem: deleteArchivedLibraryItem,
      onRestoreArchivedItem: restoreArchivedLibraryItem,
      archiveSelectionMode: isArchiveSelectionMode,
      isArchivedItemSelected: isArchivedLibraryItemSelected,
      onToggleArchivedItem: toggleArchivedLibraryItem,
    }),
    [
      deleteArchivedLibraryItem,
      isArchiveSelectionMode,
      isArchivedLibraryItemSelected,
      openReader,
      restoreArchivedLibraryItem,
      retryJob,
      selectArchivedLibraryItem,
      toggleArchivedLibraryItem,
    ],
  );

  const { historyCloseRequest, closeItem } = useHistory({
    activeView,
    activeSpaceId,
    query,
    selectedItem,
    items,
    archivedItems,
    similarItemCacheRef,
    filteredItemsRef,
    selectionRectsRef,
    selectionScrollRef,
    bringHistoryCardIntoView,
    selectArchivedLibraryItem,
    setActiveView,
    setActiveSpaceId,
    setQuery,
    setSelectedItem,
  });

  const expandedOverlayActions = useMemo<ExpandedOverlayActions>(
    () => ({
      onClose: closeItem,
      onOpenPdf: setPdfViewerItem,
      onOpenReader: openReader,
      onLoadSimilar: loadSimilarLibraryItems,
      onOpenItem: openSimilarItem,
      onShowInFolder: canUseDesktopBackend ? showItemInFolderFromOverlay : undefined,
      onDelete: deleteArchivedLibraryItem,
      onForget: forgetItem,
      onRetryJob: retryJob,
      onAddTag: addTagToItem,
      onUpdateNote: updateNote,
      onToggleSpace: (item, spaceId) => void handleToggleItemInSpace(item, spaceId),
    }),
    [
      addTagToItem,
      canUseDesktopBackend,
      closeItem,
      deleteArchivedLibraryItem,
      forgetItem,
      handleToggleItemInSpace,
      loadSimilarLibraryItems,
      openReader,
      openSimilarItem,
      retryJob,
      setPdfViewerItem,
      updateNote,
    ],
  );

  useMascotMood({
    canUseDesktopBackend,
    activeJobCount,
    items,
    captureError,
    isSearchFocused,
    query,
  });

  const sidebarActionErrorAlert = sidebarActionError ? (
    <SidebarError
      message={sidebarActionError}
      collapsed={!isSidebarOpen}
      onDismiss={() => setSidebarActionError(null)}
    />
  ) : null;

  // Dev-only mascot board (vendored bloub engine + inkling skins). Not linked
  // from the UI; open with ?mascot. Placed after all hooks.
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mascot-alive")
  ) {
    return (
      <Suspense fallback={null}>
        <AliveBoard />
      </Suspense>
    );
  }
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mascot")) {
    return (
      <Suspense fallback={null}>
        <MascotBoard />
      </Suspense>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop is an optional capture path; Add, paste, and extension capture remain keyboard-accessible. */}
      <div
        className={`app-shell relative flex h-full min-h-screen overflow-hidden bg-canvas wide:bg-app ${isElectronRuntime() ? "electron-shell" : ""} ${isDragActive ? "drag-active" : ""} ${isSettingsOpen ? "settings-open" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <TitleBar />
        <Sidebar
          isOpen={isSidebarOpen}
          edgeToggle={appearance.sidebarToggle === "edge"}
          isSearchFocused={isSearchFocused}
          everything={{
            active: activeView === "Everything" && !activeSpaceId,
            count: items.length,
            onSelect: clearToDefaultView,
          }}
          onClose={() => setIsSidebarOpen(false)}
          footer={
            <>
              <AddMenu
                open={isAdding}
                mode={captureMode}
                saving={isCapturing}
                error={isAdding ? captureError : null}
                onOpen={() => openCapture()}
                onClose={closeCaptureModal}
                onModeChange={(mode) => {
                  setCaptureMode(mode);
                  setCaptureError(null);
                }}
                onSaveNote={(text) => saveFromAddMenu(() => persistText(text, "quick note"))}
                onSaveLink={(url) => saveFromAddMenu(() => persistArticle(url, "quick link"))}
                onSaveQuote={(text, attribution, sourceUrl) =>
                  saveFromAddMenu(() => persistQuote(text, attribution, sourceUrl, "quick quote"))
                }
                onPickFile={(file) => void captureFile(file, "file picker")}
                onScreenshot={startScreenshotCapture}
              />
              {availableUpdate && (
                <NavRow
                  tone="update"
                  aria-live="polite"
                  disabled={isInstallingUpdate}
                  data-tooltip={`Version ${availableUpdate.version} is ready. Inkling checks for updates when it opens; GitHub sees the app version but no library data. Selecting this downloads and installs the update, then restarts inkling.`}
                  onClick={() => void handleInstallUpdate()}
                >
                  <HugeiconsIcon
                    icon={isInstallingUpdate ? Loading01Icon : RotateCwIcon}
                    size={15}
                  />
                  <span className={navLabelClass}>
                    {isInstallingUpdate
                      ? "Installing update..."
                      : updateInstallFailed
                        ? "Update failed · retry"
                        : "Update available"}
                  </span>
                </NavRow>
              )}
              <NavRow
                ref={settingsButtonRef}
                tone="footer"
                active={isSettingsOpen}
                aria-label="Settings"
                aria-expanded={isSettingsOpen}
                aria-controls="settings-modal"
                data-tooltip="Settings"
                onClick={() => {
                  setSelectedItem(null);
                  setIsSettingsOpen(true);
                }}
              >
                <HugeiconsIcon icon={Settings01Icon} size={15} />
                <span className={navLabelClass}>Settings</span>
              </NavRow>
            </>
          }
        >
          <SpacesSection
            spaces={spaces}
            activeSpaceId={activeSpaceId}
            activeCount={filteredItems.length}
            renaming={{
              id: renamingSpaceId,
              draft: renameDraft,
              setDraft: setRenameDraft,
              inputRef: spaceRenameInputRef,
            }}
            actions={{
              select: selectSpace,
              cycleColor: (space) => void handleCycleSpaceColor(space),
              move: (space, direction) => void handleMoveSpace(space, direction),
              startRename: (space) => {
                setRenamingSpaceId(space.id);
                setRenameDraft(space.name);
              },
              rename: (space, name) => void handleRenameSpace(space, name),
              cancelRename: () => setRenamingSpaceId(null),
              remove: (space) => void handleDeleteSpace(space),
            }}
            draft={{
              isOpen: isCreatingSpace,
              name: newSpaceName,
              kind: newSpaceKind,
              query,
              nameInputRef: newSpaceNameInputRef,
              toggle: () => {
                setIsCreatingSpace((current) => !current);
                setNewSpaceName("");
                setNewSpaceKind("smart");
              },
              setName: setNewSpaceName,
              setKind: setNewSpaceKind,
              cancel: () => {
                setIsCreatingSpace(false);
                setNewSpaceName("");
              },
              submit: handleCreateSpace,
            }}
          />
          {isSidebarOpen && sidebarActionErrorAlert}
        </Sidebar>
        {/* A closed sidebar's grip would sit over an open item's stage. */}
        {appearance.sidebarToggle === "edge" && (isSidebarOpen || !selectedItem) && (
          <SidebarEdgeGrip
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen((open) => !open)}
          />
        )}

        {/* An open item replaces the library, which stays mounted underneath so
            the item can fly back into its card. */}
        <main
          className={`main-content ${isSidebarOpen ? "" : "is-sidebar-closed"}`}
          ref={libraryFrameRef}
          inert={selectedItem != null}
        >
          <section className="library-header"></section>

          <CaptureBar
            ref={captureBarRef}
            leading={
              !isSidebarOpen && (
                <>
                  <SidebarOpenButton
                    edgeToggle={appearance.sidebarToggle === "edge"}
                    onOpen={() => setIsSidebarOpen(true)}
                  />
                  {sidebarActionErrorAlert}
                </>
              )
            }
            showSearch={showBrowseControls}
            searchRef={searchRef}
            view={activeSpace?.name ?? activeView}
            query={query}
            isSearchFocused={isSearchFocused}
            onSearchFocusChange={setIsSearchFocused}
            onQueryChange={(value) => {
              setActiveSpaceId(null);
              setActiveView("Everything");
              setQuery(value);
            }}
            onClearQuery={() => setQuery("")}
            showFilterRow={showFilterRow}
            resultCount={filteredItems.length}
            onSaveSearch={beginSaveSearch}
            captureError={showCaptureError ? captureError : null}
          />

          <ViewDock
            ref={viewDockRef}
            look={appearance.viewToggle}
            show={showBrowseControls}
            listMode={listMode}
            selectionListMode={viewSelectionListMode}
            onSwitch={switchLibraryView}
          />

          <LibraryStage
            scrollRef={libraryScrollRef}
            glassTargets={[captureBarRef, viewDockRef, tooltipLayerRef, cardMenuLayerRef]}
            items={filteredItems}
            listMode={listMode}
            columnCount={gridColumnCount}
            context={libraryCardContext}
            hasPinnedQuery={hasPinnedQuery}
            emptySpaceName={activeSpace?.kind === "regular" ? activeSpace.name : undefined}
            onClearSearch={() => {
              setQuery("");
              clearToDefaultView();
            }}
          />
        </main>

        {isFirstRunOpen ? <FirstRunOverlay onFinish={finishFirstRun} /> : null}

        <ShortcutsDialog open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen} />

        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              key="settings-modal-backdrop"
              className="settings-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsSettingsOpen(false);
              }}
            >
              <motion.section
                ref={settingsDialogRef}
                id="settings-modal"
                className="settings-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-modal-title"
                tabIndex={-1}
                initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
                animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                exit={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              >
                <aside className="settings-modal-sidebar" aria-label="Settings sections">
                  <header className="settings-sidebar-header">
                    <h2>Settings</h2>
                  </header>
                  <div className="settings-sidebar-content">
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "general" || settingsTab === "licenses" ? "active" : ""}`}
                      aria-current={settingsTab === "general" ? "page" : undefined}
                      onClick={() => setSettingsTab("general")}
                    >
                      <HugeiconsIcon icon={Settings01Icon} size={15} />
                      <span>General</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "appearance" ? "active" : ""}`}
                      aria-current={settingsTab === "appearance" ? "page" : undefined}
                      onClick={() => setSettingsTab("appearance")}
                    >
                      <HugeiconsIcon icon={PaintBoardIcon} size={15} />
                      <span>Appearance</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "data" ? "active" : ""}`}
                      aria-current={settingsTab === "data" ? "page" : undefined}
                      onClick={() => setSettingsTab("data")}
                    >
                      <HugeiconsIcon icon={Database02Icon} size={15} />
                      <span>Library</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "archive" ? "active" : ""}`}
                      aria-current={settingsTab === "archive" ? "page" : undefined}
                      onClick={() => setSettingsTab("archive")}
                    >
                      <HugeiconsIcon icon={Archive01Icon} size={15} />
                      <span>Archive</span>
                      {isArchiveLoaded && (
                        <span className="settings-tab-count">{archivedItems.length}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${settingsTab === "extension" ? "active" : ""}`}
                      aria-current={settingsTab === "extension" ? "page" : undefined}
                      onClick={() => setSettingsTab("extension")}
                    >
                      <HugeiconsIcon icon={Link01Icon} size={15} />
                      <span>Browser extension</span>
                    </button>
                  </div>
                  <div className="settings-sidebar-footer">
                    {appVersion && <p className="settings-sidebar-version">inkling {appVersion}</p>}
                  </div>
                </aside>

                {settingsTab === "general" ? (
                  <section className="settings-panel" aria-labelledby="general-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="general-panel-title">General</h2>
                        </div>
                        <p className="settings-panel-note">How inkling behaves across the app.</p>
                      </div>
                      <button
                        type="button"
                        className="icon-button settings-close"
                        onClick={() => setIsSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    </header>

                    <div className="settings-scroll">
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon icon={PlayIcon} size={17} />
                        </span>
                        <div className="settings-data-text">
                          <h3>Welcome tour</h3>
                          <p>
                            Replay the screens from your first launch: saving things, finding them
                            again, and keeping your library on this computer.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="settings-data-button"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            setIsFirstRunOpen(true);
                          }}
                        >
                          Show the welcome again
                        </button>
                      </div>
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon icon={LicenseThirdPartyIcon} size={17} />
                        </span>
                        <div className="settings-data-text">
                          <h3>Open source licenses</h3>
                          <p>The projects inkling is built on, and the terms they come with.</p>
                        </div>
                        <button
                          type="button"
                          className="settings-data-button"
                          onClick={() => setSettingsTab("licenses")}
                        >
                          View licenses
                        </button>
                      </div>
                    </div>
                  </section>
                ) : settingsTab === "licenses" ? (
                  <OpenSourceLicenses
                    onBack={() => setSettingsTab("general")}
                    onClose={() => setIsSettingsOpen(false)}
                  />
                ) : settingsTab === "appearance" ? (
                  <section className="settings-panel" aria-labelledby="appearance-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="appearance-panel-title">Appearance</h2>
                        </div>
                        <p className="settings-panel-note">Try other looks for parts of the app.</p>
                      </div>
                      <button
                        type="button"
                        className="icon-button settings-close"
                        onClick={() => setIsSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    </header>

                    <div className="settings-scroll">
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon icon={Grid2X2Icon} size={17} />
                        </span>
                        <div className="settings-data-text">
                          <h3>Grid and list toggle</h3>
                          <p>The switch at the bottom of the library.</p>
                        </div>
                        <SegmentedControl
                          className="settings-segmented"
                          name="appearance-view-toggle"
                          label="Grid and list toggle style"
                          value={appearance.viewToggle}
                          onChange={(value) => setAppearanceOption("viewToggle", value)}
                          options={APPEARANCE_OPTIONS.viewToggle}
                        />
                      </div>
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon icon={SidebarLeftIcon} size={17} />
                        </span>
                        <div className="settings-data-text">
                          <h3>Sidebar button</h3>
                          <p>How the sidebar opens and closes.</p>
                        </div>
                        <SegmentedControl
                          className="settings-segmented"
                          name="appearance-sidebar-toggle"
                          label="Sidebar button style"
                          value={appearance.sidebarToggle}
                          onChange={(value) => setAppearanceOption("sidebarToggle", value)}
                          options={APPEARANCE_OPTIONS.sidebarToggle}
                        />
                      </div>
                    </div>
                  </section>
                ) : settingsTab === "archive" ? (
                  <section className="settings-panel" aria-labelledby="archive-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="archive-panel-title">Archive</h2>
                        </div>
                        {isArchiveLoaded && (
                          <p className="settings-panel-note">
                            {archivedItems.length === 1
                              ? "1 thing you put away. It waits here,"
                              : `${archivedItems.length} things you put away. They wait here,`}{" "}
                            out of your library, until you bring{" "}
                            {archivedItems.length === 1 ? "it" : "them"} back or let{" "}
                            {archivedItems.length === 1 ? "it" : "them"} go.
                          </p>
                        )}
                      </div>
                      <div className="settings-panel-tools">
                        <fieldset className="settings-archive-actions">
                          <legend className="visually-hidden">Archive actions</legend>
                          {isArchiveSelectionMode && (
                            <>
                              <span
                                className="settings-selected-count"
                                role="status"
                                aria-live="polite"
                              >
                                {selectedArchivedIds.size} selected
                              </span>
                              <button
                                type="button"
                                className="settings-batch-button settings-batch-restore"
                                disabled={selectedArchivedIds.size === 0}
                                onClick={() => void restoreSelectedArchivedItems()}
                              >
                                Restore
                              </button>
                              <button
                                type="button"
                                className="settings-batch-button settings-batch-delete"
                                disabled={selectedArchivedIds.size === 0}
                                onClick={() => void deleteSelectedArchivedItems()}
                              >
                                Delete
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className={`settings-select-button ${isArchiveSelectionMode ? "is-active" : ""}`}
                            aria-pressed={isArchiveSelectionMode}
                            aria-label={
                              isArchiveSelectionMode
                                ? "Exit multi-select mode"
                                : "Select archived items"
                            }
                            onClick={toggleArchiveSelectionMode}
                          >
                            <span>{isArchiveSelectionMode ? "Done" : "Select"}</span>
                          </button>
                        </fieldset>
                        <button
                          type="button"
                          className="icon-button settings-close"
                          onClick={() => setIsSettingsOpen(false)}
                          aria-label="Close settings"
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={14} />
                        </button>
                      </div>
                    </header>

                    {isArchiveLoaded && archivedItems.length > 0 ? (
                      <ArchiveGrid
                        data={archivedItems}
                        context={archivedCardContext}
                        ItemContent={LibraryCard}
                      />
                    ) : (
                      <div className="settings-scroll">
                        {isArchiveLoaded && (
                          <div className="settings-empty-state">
                            <div className="settings-empty-icon">
                              <HugeiconsIcon icon={Archive01Icon} size={19} />
                            </div>
                            <h4>Your archive is empty.</h4>
                            <p>Items you forget from the library will appear here.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                ) : settingsTab === "data" ? (
                  <section className="settings-panel" aria-labelledby="data-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="data-panel-title">Your library</h2>
                        </div>
                        <p className="settings-panel-note">
                          It lives in one folder on this computer. Back it up by exporting a copy,
                          or bring an old copy back in.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="icon-button settings-close"
                        onClick={() => setIsSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    </header>

                    <div className="settings-scroll">
                      <LibraryMakeup
                        kinds={wholeLibraryKinds ?? items.map((item) => item.kind)}
                        sizeBytes={librarySizeBytes}
                        onShowFolder={
                          canUseLibraryFolderPicker ? showLibraryFolderFromSettings : undefined
                        }
                      />
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon
                            icon={isExportingLibrary ? Loading01Icon : Download04Icon}
                            size={17}
                          />
                        </span>
                        <div className="settings-data-text">
                          <h3>Export a copy</h3>
                          <p>
                            A dated folder with the database, every file, and a manifest. Keep it on
                            another drive.
                          </p>
                          {lastCopy ? (
                            <p className="settings-data-copy">{formatLastCopy(lastCopy)}</p>
                          ) : null}
                          {!canUseLibraryFolderPicker ? (
                            <p className="settings-data-hint">Export runs in the desktop app.</p>
                          ) : null}
                          {lastExport ? (
                            <div className="settings-data-result" role="status" aria-live="polite">
                              <span className="settings-data-summary">
                                {formatExportSummary(lastExport)}
                              </span>
                              <span className="settings-data-path">{lastExport.directory}</span>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={`settings-data-button is-primary ${isExportingLibrary ? "is-busy" : ""}`}
                          disabled={
                            !canUseLibraryFolderPicker || isExportingLibrary || isImportingLibrary
                          }
                          onClick={() => void exportLibraryToFolder()}
                        >
                          {isExportingLibrary ? "Exporting…" : "Export…"}
                        </button>
                      </div>
                      <div className="settings-data-row">
                        <span className="settings-data-icon" aria-hidden="true">
                          <HugeiconsIcon
                            icon={isImportingLibrary ? Loading01Icon : Upload04Icon}
                            size={17}
                          />
                        </span>
                        <div className="settings-data-text">
                          <h3>Restore from an export</h3>
                          <p>
                            Adds its items, files and Spaces here. Nothing already in your library
                            gets replaced.
                          </p>
                          {!canUseLibraryFolderPicker ? (
                            <p className="settings-data-hint">Restore runs in the desktop app.</p>
                          ) : null}
                          {lastImport ? (
                            <div className="settings-data-result" role="status" aria-live="polite">
                              <span className="settings-data-summary">
                                {formatImportSummary(lastImport)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={`settings-data-button ${isImportingLibrary ? "is-busy" : ""}`}
                          disabled={
                            !canUseLibraryFolderPicker || isExportingLibrary || isImportingLibrary
                          }
                          onClick={() => void importLibraryFromFolder()}
                        >
                          {isImportingLibrary ? "Restoring…" : "Restore…"}
                        </button>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="settings-panel" aria-labelledby="extension-panel-title">
                    <header className="settings-panel-header">
                      <div className="settings-panel-header-content">
                        <div className="settings-panel-heading">
                          <h2 id="extension-panel-title">Browser extension</h2>
                        </div>
                        <p className="settings-panel-note">
                          Save pages without leaving the browser
                        </p>
                      </div>
                      <button
                        type="button"
                        className="icon-button settings-close"
                        onClick={() => setIsSettingsOpen(false)}
                        aria-label="Close settings"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    </header>

                    <div className="settings-scroll">
                      <ExtensionPairing />
                    </div>
                  </section>
                )}
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedItem && (
          <Suspense fallback={null}>
            <ExpandedItemOverlay
              key="expanded-item-overlay"
              item={selectedItem}
              actions={expandedOverlayActions}
              spaces={selectedItemSpaces}
              originRectsRef={selectionRectsRef}
              frameRef={libraryFrameRef}
              historyCloseRequest={historyCloseRequest}
            />
          </Suspense>
        )}
        <AnimatePresence>
          {pdfViewerItem?.fileUrl && (
            <motion.div
              key="pdf-viewer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            >
              <Suspense fallback={null}>
                <PdfViewer
                  url={pdfViewerItem.fileUrl}
                  title={pdfViewerItem.title}
                  onClose={() => setPdfViewerItem(null)}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {readingItem?.item.articleHtml && (
            <Suspense key={readingItem.item.id} fallback={null}>
              <ReaderView
                item={
                  {
                    id: readingItem.item.id,
                    title: readingItem.item.title,
                    author: readingItem.item.articleAuthor,
                    publishedDate: readingItem.item.publishedDate,
                    savedDate: readingItem.item.date,
                    sourceLabel: readingItem.item.source,
                    sourceUrl: readingItem.item.sourceUrl ?? "",
                    html: readingItem.item.articleHtml,
                  } satisfies ReaderItem
                }
                origin={readingItem.origin}
                onRequestClose={closeReader}
              />
            </Suspense>
          )}
        </AnimatePresence>
      </div>
      <TooltipLayer ref={tooltipLayerRef} />
      <div ref={cardMenuLayerRef}>
        {cardMenu && (
          <ContextMenu
            key={`${cardMenu.item.id}:${cardMenu.x},${cardMenu.y}`}
            x={cardMenu.x}
            y={cardMenu.y}
            label={cardMenu.item.title}
            entries={cardMenuEntries}
            returnFocus={cardMenu.card}
            container={cardMenuLayerRef}
            onClose={closeCardMenu}
          />
        )}
      </div>
      <Toaster
        position="top-right"
        offset={{ top: 48, right: 16 }}
        mobileOffset={{ top: 16, right: 12 }}
        theme="dark"
        richColors={false}
        closeButton
        duration={5000}
        icons={{
          success: <></>,
          error: <></>,
          close: <HugeiconsIcon icon={Cancel01Icon} size={12} color="currentColor" />,
        }}
        containerAriaLabel="Notifications"
      />
    </MotionConfig>
  );
}

export default App;
