import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import {
  retryProcessingJob,
  isDesktopRuntime,
  isElectronRuntime,
  type StoredSpace,
} from "./lib/libraryApi";
import { FirstRunOverlay } from "./components/FirstRunOverlay";
import { ContextMenu } from "./components/ContextMenu/ContextMenu";
// Below-the-fold / on-demand surfaces stay off the boot bundle and load from
// local disk on first open (Suspense fallback null: no spinner, no layout
// shift — the chunk resolves in milliseconds).
const PdfViewer = lazy(() => import("./features/item-view/PdfViewer"));

const ItemView = lazy(() =>
  import("./features/item-view/ItemView").then((module) => ({
    default: module.ItemView,
  })),
);
import type { ItemViewActions } from "./features/item-view/ItemView";
const ReaderView = lazy(() =>
  import("./ReaderView").then((module) => ({ default: module.ReaderView })),
);
import type { ReaderItem } from "./ReaderView";
import type { LibraryItem } from "./lib/types";
import { shouldUseSeedLibrary } from "./lib/previewMode";
import { AddMenu } from "./features/capture/AddMenu/AddMenu";
import { CaptureBar } from "./features/capture/CaptureBar";
import { ShortcutsDialog } from "./features/capture/ShortcutsDialog";
import { useCapture } from "./features/capture/useCapture";
import { useItemDetails, showItemInFolderFromOverlay } from "./features/item-view/useItemDetails";
import { useItemSelection } from "./features/item-view/useItemSelection";
import type { LibraryCardContext } from "./features/library/LibraryCard";
import { LibraryStage } from "./features/library/LibraryStage";
import { useCardMenu } from "./features/library/useCardMenu";
import { useLibraryData } from "./features/library/useLibraryData";
import { useLibraryView } from "./features/library/useLibraryView";
import { ViewDock } from "./features/library/ViewDock";
import { useArchive } from "./features/settings/useArchive";
import {
  showLibraryFolderFromSettings,
  useLibraryTransfer,
} from "./features/settings/useLibraryTransfer";
import { SettingsSheet } from "./features/settings/SettingsSheet";
import { useSettings } from "./features/settings/useSettings";
import { NavRow, navLabelClass, Sidebar, SidebarError } from "./features/shell/Sidebar";
import { SidebarEdgeGrip, SidebarOpenButton } from "./features/shell/SidebarToggles";
import { SpacesSection } from "./features/shell/SpacesSection";
import { TitleBar } from "./features/shell/TitleBar";
import { UpdateNavRow } from "./features/shell/UpdateNavRow";
import { useAppShortcuts } from "./features/shell/useAppShortcuts";
import { useAppUpdate } from "./features/shell/useAppUpdate";
import { useFirstRun } from "./features/shell/useFirstRun";
import { useHistory } from "./features/shell/useHistory";
import { useMascotMood } from "./features/shell/useMascotMood";
import { useSidebarOpen } from "./features/shell/useSidebarOpen";
import "./features/shell/codex-sidebar.css";
import { itemMatchesSmartQuery } from "./features/spaces/smartQuery";
import { useSpaces } from "./features/spaces/useSpaces";
import { cx } from "./ui/cx";
import { Toaster } from "./ui/Toaster";
import { TooltipLayer } from "./ui/Tooltip";
import { errorMessage } from "./features/errorMessage";

function App() {
  const canUseDesktopBackend = isDesktopRuntime() && !shouldUseSeedLibrary();
  const [query, setQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeView, setActiveView] = useState("Everything");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const selectedItemId = selectedItem ? String(selectedItem.id) : null;
  const [isSidebarOpen, setIsSidebarOpen] = useSidebarOpen();
  const { isFirstRunOpen, setIsFirstRunOpen, finishFirstRun } = useFirstRun(canUseDesktopBackend);
  const appUpdate = useAppUpdate(canUseDesktopBackend);
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
  const codexSidebar = appearance.sidebarStyle === "codex";
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
      setCaptureError(errorMessage(error));
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
    canUseDesktopBackend,
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
    captureFiles,
    fileImport,
    clearFileImport,
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
  useLayoutEffect(() => {
    filteredItemsRef.current = filteredItems;
  }, [filteredItems]);
  // A pinned query has its own band above the grid, so the grid starts below it.
  // Only this boolean reaches the grid, so typing does not restyle it.
  const showFilterRow = !isSearchFocused && query.trim() !== "";
  // An empty Space has nothing to search or re-lay out, so it drops the
  // browsing controls.
  const showBrowseControls = !activeSpace || filteredItems.length > 0 || query.trim() !== "";
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

  const expandedOverlayActions = useMemo<ItemViewActions>(
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

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`app-shell relative flex h-full min-h-screen overflow-hidden bg-canvas wide:bg-app ${isElectronRuntime() ? "electron-shell" : ""} ${isDragActive ? "drag-active" : ""} ${isSettingsOpen ? "settings-open" : ""}`}
        data-sidebar-style={appearance.sidebarStyle}
        data-sidebar-open={isSidebarOpen}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <TitleBar />
        <Sidebar
          experimental={codexSidebar}
          onOpen={() => setIsSidebarOpen(true)}
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
                collapsible={codexSidebar}
                compact={codexSidebar && !isSidebarOpen}
                open={isAdding}
                mode={captureMode}
                saving={isCapturing}
                error={isAdding ? captureError : null}
                onOpen={() => openCapture(null, !codexSidebar || isSidebarOpen)}
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
                onPickFile={(files) => captureFiles(files, "file picker")}
                onScreenshot={startScreenshotCapture}
                onAddSpace={
                  codexSidebar
                    ? () => {
                        setIsSidebarOpen(true);
                        setIsCreatingSpace(true);
                        setNewSpaceName("");
                        setNewSpaceKind("smart");
                      }
                    : undefined
                }
              />
              <UpdateNavRow update={appUpdate} />
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
            experimental={codexSidebar}
            collapsed={codexSidebar && !isSidebarOpen}
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
                if (codexSidebar) setIsSidebarOpen(true);
                setRenamingSpaceId(space.id);
                setRenameDraft(space.name);
              },
              rename: (space, name) => void handleRenameSpace(space, name),
              cancelRename: () => setRenamingSpaceId(null),
              remove: (space) => void handleDeleteSpace(space),
            }}
            draftNameInputRef={newSpaceNameInputRef}
            draft={{
              isOpen: isCreatingSpace,
              name: newSpaceName,
              kind: newSpaceKind,
              query,
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
        {!codexSidebar &&
          appearance.sidebarToggle === "edge" &&
          (isSidebarOpen || !selectedItem) && (
            <SidebarEdgeGrip
              isOpen={isSidebarOpen}
              onToggle={() => setIsSidebarOpen((open) => !open)}
            />
          )}

        {/* An open item replaces the library, which stays mounted underneath so
            the item can fly back into its card. */}
        <main
          className={cx(
            "relative flex h-screen min-h-0 w-auto min-w-0 flex-auto flex-col overflow-hidden pt-(--main-pad-top) pr-(--main-pad-x) pb-(--main-pad-bottom) pl-(--main-pad-x) transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] [--library-top:var(--main-pad-top)] [--main-pad-bottom:30px] [--main-pad-top:calc(4px_+_var(--spacing-titlebar))] [--main-pad-x:14px] [--stage-background:var(--color-canvas)]",
            "wide:border-y wide:border-r-0 wide:border-border wide:bg-frame wide:transition-[margin-left,padding,border-radius] wide:[--stage-background:var(--color-frame)]",
            codexSidebar && "motion-reduce:transition-none",
            // Codex retains a rail when compact; Classic closes to the window edge.
            codexSidebar || isSidebarOpen
              ? "wide:ml-(--spacing-sidebar) wide:rounded-l-frame wide:border-l"
              : "wide:ml-0 wide:rounded-none",
            "max-[1120px]:w-[calc(100vw_-_var(--spacing-sidebar))] max-[780px]:w-full max-[780px]:transition-none max-[780px]:[--library-top:42px] max-[780px]:[--main-pad-bottom:24px] max-[780px]:[--main-pad-top:12px] max-[780px]:[--main-pad-x:18px]",
          )}
          ref={libraryFrameRef}
          inert={selectedItem != null}
        >
          <section className="flex-none max-[780px]:pt-[30px]"></section>

          <CaptureBar
            ref={captureBarRef}
            leading={
              !codexSidebar &&
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

          {fileImport && (
            <div
              role="status"
              aria-live="polite"
              className="fixed right-5 bottom-5 z-50 flex items-center gap-3 rounded-xl border border-border bg-canvas px-4 py-2 text-xs shadow-sm"
            >
              <span>
                {fileImport.active
                  ? `Importing ${fileImport.completed} of ${fileImport.total} files…`
                  : `${fileImport.saved} files saved. Processing continues in the background.`}
                {fileImport.failed > 0 ? ` ${fileImport.failed} failed.` : ""}
              </span>
              {!fileImport.active && (
                <button type="button" aria-label="Dismiss import status" onClick={clearFileImport}>
                  ×
                </button>
              )}
            </div>
          )}

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
            hasPinnedQuery={showFilterRow}
            emptySpaceName={activeSpace?.kind === "regular" ? activeSpace.name : undefined}
            onClearSearch={() => {
              setQuery("");
              clearToDefaultView();
            }}
          />
        </main>

        {isFirstRunOpen ? <FirstRunOverlay onFinish={finishFirstRun} /> : null}

        <ShortcutsDialog open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen} />

        <SettingsSheet
          open={isSettingsOpen}
          dialogRef={settingsDialogRef}
          tab={settingsTab}
          onTabChange={setSettingsTab}
          onClose={() => setIsSettingsOpen(false)}
          appVersion={appVersion}
          update={appUpdate}
          appearance={appearance}
          onAppearanceChange={setAppearanceOption}
          onShowWelcome={() => {
            setIsSettingsOpen(false);
            setIsFirstRunOpen(true);
          }}
          archive={{
            items: archivedItems,
            isLoaded: isArchiveLoaded,
            selectionMode: isArchiveSelectionMode,
            selectedCount: selectedArchivedIds.size,
            context: archivedCardContext,
            onToggleSelectionMode: toggleArchiveSelectionMode,
            onRestoreSelected: () => void restoreSelectedArchivedItems(),
            onDeleteSelected: () => void deleteSelectedArchivedItems(),
          }}
          library={{
            kinds: wholeLibraryKinds ?? items.map((item) => item.kind),
            sizeBytes: librarySizeBytes,
            canUseFolderPicker: canUseDesktopBackend,
            onShowFolder: showLibraryFolderFromSettings,
            lastCopy,
            lastExport,
            lastImport,
            isExporting: isExportingLibrary,
            isImporting: isImportingLibrary,
            onExport: () => void exportLibraryToFolder(),
            onImport: () => void importLibraryFromFolder(),
          }}
        />

        {selectedItem && (
          <Suspense fallback={null}>
            <ItemView
              key="item-view"
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
      <Toaster />
    </MotionConfig>
  );
}

export default App;
