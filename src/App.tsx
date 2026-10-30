import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { isElectronRuntime, type StoredSpace } from "./lib/libraryApi";
import { FirstRunOverlay } from "./components/FirstRunOverlay";
import { ContextMenu } from "./components/ContextMenu/ContextMenu";
import type { ItemViewActions } from "./features/item-view/ItemView";
import type { LibraryItem } from "./lib/types";
import { shouldUseSeedLibrary } from "./lib/previewMode";
import { AddMenu } from "./features/capture/AddMenu/AddMenu";
import { CaptureBar } from "./features/capture/CaptureBar";
import { FileImportStatus } from "./features/capture/FileImportStatus";
import { useCapture } from "./features/capture/useCapture";
import { useItemDetails, revealItemInFolder } from "./features/item-view/useItemDetails";
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
import { ItemLayers } from "./features/shell/ItemLayers";
import { LibraryFrame } from "./features/shell/LibraryFrame";
import { ShortcutsDialog } from "./features/shell/ShortcutsDialog";
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
import { visibleLibraryItems } from "./features/spaces/smartQuery";
import { useSpaces } from "./features/spaces/useSpaces";
import { Toaster } from "./ui/Toaster";
import { TooltipLayer } from "./ui/Tooltip";

function App() {
  const canUseDesktopBackend = isElectronRuntime() && !shouldUseSeedLibrary();
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
  const {
    items,
    setItems,
    itemsRef,
    activeJobCount,
    debouncedQuery,
    noteBodyCacheRef,
    reload,
    retryJob,
  } = useLibraryData({
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
    draft: spaceDraft,
    draftNameInputRef,
    openSpaceDraft,
    renaming,
    actions: spaceActions,
    sidebarActionError,
    setSidebarActionError,
    beginSaveSearch,
    handleToggleItemInSpace,
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
    setIsSidebarOpen,
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
    changeCaptureMode,
    saveNote,
    saveLink,
    saveQuote,
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

  const filteredItems = useMemo(
    () =>
      visibleLibraryItems(items, {
        canUseDesktopBackend,
        query,
        activeView,
        activeSpace,
        localSpaceItems,
      }),
    [activeSpace, activeView, canUseDesktopBackend, items, localSpaceItems, query],
  );
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
      onShowInFolder: canUseDesktopBackend ? revealItemInFolder : undefined,
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
        data-native-captions={window.inkling?.windowControls.nativeCaptions || undefined}
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
                onOpen={() => openCapture()}
                onClose={closeCaptureModal}
                onModeChange={changeCaptureMode}
                onSaveNote={saveNote}
                onSaveLink={saveLink}
                onSaveQuote={saveQuote}
                onPickFile={(files) => captureFiles(files, "file picker")}
                onScreenshot={startScreenshotCapture}
                onAddSpace={codexSidebar ? openSpaceDraft : undefined}
              />
              <UpdateNavRow update={appUpdate} />
              <NavRow
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
            renaming={renaming}
            actions={spaceActions}
            draftNameInputRef={draftNameInputRef}
            draft={spaceDraft}
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

        <LibraryFrame
          ref={libraryFrameRef}
          codexSidebar={codexSidebar}
          isSidebarOpen={isSidebarOpen}
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

          {fileImport && <FileImportStatus progress={fileImport} onDismiss={clearFileImport} />}

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
        </LibraryFrame>

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
            onSelectItem: selectArchivedLibraryItem,
            onOpenReader: openReader,
            onRetryJob: retryJob,
            onDeleteItem: deleteArchivedLibraryItem,
            onRestoreItem: restoreArchivedLibraryItem,
            isItemSelected: isArchivedLibraryItemSelected,
            onToggleItem: toggleArchivedLibraryItem,
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

        <ItemLayers
          item={selectedItem}
          itemView={{
            actions: expandedOverlayActions,
            spaces: selectedItemSpaces,
            originRectsRef: selectionRectsRef,
            frameRef: libraryFrameRef,
            historyCloseRequest,
          }}
          pdfViewerItem={pdfViewerItem}
          onClosePdf={() => setPdfViewerItem(null)}
          readingItem={readingItem}
          onCloseReader={closeReader}
        />
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
