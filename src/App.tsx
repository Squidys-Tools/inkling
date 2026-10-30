import { useMemo, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import { isElectronRuntime } from "./lib/libraryApi";
import { FirstRunOverlay } from "./components/FirstRunOverlay";
import type { LibraryItem } from "./lib/types";
import { shouldUseSeedLibrary } from "./lib/previewMode";
import { CaptureBar } from "./features/capture/CaptureBar";
import { FileImportStatus } from "./features/capture/FileImportStatus";
import { useCapture } from "./features/capture/useCapture";
import { useItemDetails } from "./features/item-view/useItemDetails";
import { useItemSelection } from "./features/item-view/useItemSelection";
import type { LibraryCardContext } from "./features/library/LibraryCard";
import { LibraryStage } from "./features/library/LibraryStage";
import { useCardMenu } from "./features/library/useCardMenu";
import { useLibraryData } from "./features/library/useLibraryData";
import { useLibraryView } from "./features/library/useLibraryView";
import { ViewDock } from "./features/library/ViewDock";
import { useArchive } from "./features/settings/useArchive";
import { useLibraryTransfer } from "./features/settings/useLibraryTransfer";
import { SettingsSheet } from "./features/settings/SettingsSheet";
import { useSettings } from "./features/settings/useSettings";
import { AppSidebar, ClosedSidebarControls } from "./features/shell/AppSidebar";
import { CardMenuLayer } from "./features/shell/CardMenuLayer";
import { ItemLayers } from "./features/shell/ItemLayers";
import { LibraryFrame } from "./features/shell/LibraryFrame";
import { ShortcutsDialog } from "./features/shell/ShortcutsDialog";
import { TitleBar } from "./features/shell/TitleBar";
import { useAppShortcuts } from "./features/shell/useAppShortcuts";
import { useAppUpdate } from "./features/shell/useAppUpdate";
import { useFirstRun } from "./features/shell/useFirstRun";
import { useHistory } from "./features/shell/useHistory";
import { useLibraryScope } from "./features/shell/useLibraryScope";
import { useMascotMood } from "./features/shell/useMascotMood";
import { useSidebarOpen } from "./features/shell/useSidebarOpen";
import "./features/shell/codex-sidebar.css";
import { useVisibleItems } from "./features/spaces/smartQuery";
import { useSpaces } from "./features/spaces/useSpaces";
import { Toaster } from "./ui/Toaster";
import { TooltipLayer } from "./ui/Tooltip";

function App() {
  const canUseDesktopBackend = isElectronRuntime() && !shouldUseSeedLibrary();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const scope = useLibraryScope(setSelectedItem);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const selectedItemId = selectedItem ? String(selectedItem.id) : null;
  const [isSidebarOpen, setIsSidebarOpen] = useSidebarOpen();
  const { isFirstRunOpen, setIsFirstRunOpen, finishFirstRun } = useFirstRun(canUseDesktopBackend);
  const appUpdate = useAppUpdate(canUseDesktopBackend);
  const library = useLibraryData({
    canUseDesktopBackend,
    query: scope.query,
    activeSpaceId: scope.activeSpaceId,
    setSelectedItem,
    setCaptureError,
  });
  const settings = useSettings({
    canUseDesktopBackend,
    activeSpaceId: scope.activeSpaceId,
    debouncedQuery: library.debouncedQuery,
  });
  const codexSidebar = settings.appearance.sidebarStyle === "codex";
  const archive = useArchive({
    canUseDesktopBackend,
    isSettingsOpen: settings.isSettingsOpen,
    isArchiveTabOpen: settings.isArchiveTabOpen,
    setItems: library.setItems,
    itemsRef: library.itemsRef,
    noteBodyCacheRef: library.noteBodyCacheRef,
    selectedItem,
    setSelectedItem,
    setCaptureError,
  });
  const details = useItemDetails({
    canUseDesktopBackend,
    selectedItem,
    setSelectedItem,
    setItems: library.setItems,
    setArchivedItems: archive.setArchivedItems,
    noteBodyCacheRef: library.noteBodyCacheRef,
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
  const selection = useItemSelection({
    libraryScrollRef,
    captureBarRef,
    filteredItemsRef,
    selectedItem,
    setSelectedItem,
  });

  const spaces = useSpaces({
    canUseDesktopBackend,
    scope,
    selectedItemId,
    reload: library.reload,
    setCaptureError,
    setIsSidebarOpen,
  });
  const transfer = useLibraryTransfer({
    canUseDesktopBackend,
    setLastCopy: settings.setLastCopy,
    setSpaces: spaces.setSpaces,
    setArchivedItems: archive.setArchivedItems,
    setIsArchiveLoaded: archive.setIsArchiveLoaded,
    reload: library.reload,
    setCaptureError,
  });
  const { listMode, viewSelectionListMode, switchLibraryView, gridColumnCount } =
    useLibraryView(libraryScrollRef);
  const capture = useCapture({
    canUseDesktopBackend,
    setItems: library.setItems,
    setSelectedItem,
    setCaptureError,
  });
  const { isShortcutsOpen, setIsShortcutsOpen } = useAppShortcuts({
    searchRef,
    readingItem: details.readingItem,
    selectedItem,
    pdfViewerItem: details.pdfViewerItem,
    isSettingsOpen: settings.isSettingsOpen,
    setIsSettingsOpen: settings.setIsSettingsOpen,
    capture,
    setIsSidebarOpen,
  });

  const filteredItems = useVisibleItems(
    library.items,
    {
      canUseDesktopBackend,
      query: scope.query,
      activeView: scope.activeView,
      activeSpace: spaces.activeSpace,
      localSpaceItems: spaces.localSpaceItems,
    },
    filteredItemsRef,
  );
  // A pinned query has its own band above the grid, so the grid starts below it.
  // Only this boolean reaches the grid, so typing does not restyle it.
  const showFilterRow = !isSearchFocused && scope.query.trim() !== "";
  // An empty Space has nothing to search or re-lay out, so it drops the
  // browsing controls.
  const showBrowseControls =
    !spaces.activeSpace || filteredItems.length > 0 || scope.query.trim() !== "";
  const showCaptureError = Boolean(captureError) && !capture.isAdding;

  const cardMenu = useCardMenu({
    canUseDesktopBackend,
    openReader: details.openReader,
    forgetItem: archive.forgetItem,
  });

  const libraryCardContext = useMemo<LibraryCardContext>(
    () => ({
      layout: listMode ? "list" : "grid",
      onSelectItem: selection.selectLibraryItem,
      onOpenReader: details.openReader,
      onRetryJob: library.retryJob,
      onOpenMenu: cardMenu.openCardMenu,
    }),
    [
      listMode,
      cardMenu.openCardMenu,
      details.openReader,
      library.retryJob,
      selection.selectLibraryItem,
    ],
  );

  const { historyCloseRequest, closeItem } = useHistory({
    scope,
    selectedItem,
    items: library.items,
    archivedItems: archive.archivedItems,
    similarItemCacheRef: details.similarItemCacheRef,
    filteredItemsRef,
    selectionRectsRef: selection.selectionRectsRef,
    selectionScrollRef: selection.selectionScrollRef,
    bringHistoryCardIntoView: selection.bringHistoryCardIntoView,
    selectArchivedLibraryItem: selection.selectArchivedLibraryItem,
    setSelectedItem,
  });

  useMascotMood({
    canUseDesktopBackend,
    activeJobCount: library.activeJobCount,
    items: library.items,
    captureError,
    isSearchFocused,
    query: scope.query,
  });

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`app-shell relative flex h-full min-h-screen overflow-hidden bg-canvas wide:bg-app ${isElectronRuntime() ? "electron-shell" : ""} ${capture.isDragActive ? "drag-active" : ""} ${settings.isSettingsOpen ? "settings-open" : ""}`}
        data-sidebar-style={settings.appearance.sidebarStyle}
        data-sidebar-open={isSidebarOpen}
        data-native-captions={window.inkling?.windowControls.nativeCaptions || undefined}
        onDragOver={capture.handleDragOver}
        onDragLeave={capture.handleDragLeave}
        onDrop={capture.handleDrop}
      >
        <TitleBar />
        <AppSidebar
          appearance={settings.appearance}
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          isSearchFocused={isSearchFocused}
          everything={{
            active: scope.activeView === "Everything" && !scope.activeSpaceId,
            count: library.items.length,
            onSelect: scope.clearToDefaultView,
          }}
          capture={capture}
          captureError={captureError}
          spaces={spaces}
          activeSpaceId={scope.activeSpaceId}
          activeCount={filteredItems.length}
          update={appUpdate}
          isSettingsOpen={settings.isSettingsOpen}
          onOpenSettings={() => {
            setSelectedItem(null);
            settings.setIsSettingsOpen(true);
          }}
          hasOpenItem={selectedItem != null}
        />
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
              <ClosedSidebarControls
                appearance={settings.appearance}
                isOpen={isSidebarOpen}
                setIsOpen={setIsSidebarOpen}
                spaces={spaces}
              />
            }
            showSearch={showBrowseControls}
            searchRef={searchRef}
            view={spaces.activeSpace?.name ?? scope.activeView}
            query={scope.query}
            isSearchFocused={isSearchFocused}
            onSearchFocusChange={setIsSearchFocused}
            onQueryChange={scope.searchEverything}
            onClearQuery={() => scope.setQuery("")}
            showFilterRow={showFilterRow}
            resultCount={filteredItems.length}
            onSaveSearch={spaces.beginSaveSearch}
            captureError={showCaptureError ? captureError : null}
          />

          {capture.fileImport && (
            <FileImportStatus progress={capture.fileImport} onDismiss={capture.clearFileImport} />
          )}

          <ViewDock
            ref={viewDockRef}
            look={settings.appearance.viewToggle}
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
            emptySpaceName={
              spaces.activeSpace?.kind === "regular" ? spaces.activeSpace.name : undefined
            }
            onClearSearch={() => scope.searchEverything("")}
          />
        </LibraryFrame>

        {isFirstRunOpen ? <FirstRunOverlay onFinish={finishFirstRun} /> : null}

        <ShortcutsDialog open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen} />

        <SettingsSheet
          settings={settings}
          update={appUpdate}
          onShowWelcome={() => {
            settings.setIsSettingsOpen(false);
            setIsFirstRunOpen(true);
          }}
          archive={archive}
          transfer={transfer}
          items={library.items}
          canUseDesktopBackend={canUseDesktopBackend}
          onSelectArchivedItem={selection.selectArchivedLibraryItem}
          onOpenReader={details.openReader}
          onRetryJob={library.retryJob}
        />

        <ItemLayers
          item={selectedItem}
          details={details}
          archive={archive}
          selection={selection}
          spaces={spaces}
          canUseDesktopBackend={canUseDesktopBackend}
          onClose={closeItem}
          onRetryJob={library.retryJob}
          frameRef={libraryFrameRef}
          historyCloseRequest={historyCloseRequest}
        />
      </div>
      <TooltipLayer ref={tooltipLayerRef} />
      <CardMenuLayer ref={cardMenuLayerRef} menu={cardMenu} />
      <Toaster />
    </MotionConfig>
  );
}

export default App;
