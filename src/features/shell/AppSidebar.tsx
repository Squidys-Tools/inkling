import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Dispatch, SetStateAction } from "react";
import { AddMenu } from "../capture/AddMenu/AddMenu";
import type { useCapture } from "../capture/useCapture";
import type { Appearance } from "../settings/appearance";
import type { useSpaces } from "../spaces/useSpaces";
import { NavRow, navLabelClass, Sidebar, SidebarError } from "./Sidebar";
import { SidebarEdgeGrip, SidebarOpenButton } from "./SidebarToggles";
import { SpacesSection } from "./SpacesSection";
import { UpdateNavRow } from "./UpdateNavRow";
import type { useAppUpdate } from "./useAppUpdate";

export function AppSidebar({
  appearance,
  isOpen,
  setIsOpen,
  isSearchFocused,
  everything,
  capture,
  captureError,
  spaces,
  activeSpaceId,
  activeCount,
  update,
  isSettingsOpen,
  onOpenSettings,
  hasOpenItem,
}: {
  appearance: Appearance;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  isSearchFocused: boolean;
  everything: { active: boolean; count: number; onSelect: () => void };
  capture: ReturnType<typeof useCapture>;
  captureError: string | null;
  spaces: ReturnType<typeof useSpaces>;
  activeSpaceId: string | null;
  activeCount: number;
  update: ReturnType<typeof useAppUpdate>;
  isSettingsOpen: boolean;
  onOpenSettings: () => void;
  hasOpenItem: boolean;
}) {
  const codexSidebar = appearance.sidebarStyle === "codex";
  return (
    <>
      <Sidebar
        experimental={codexSidebar}
        onOpen={() => setIsOpen(true)}
        isOpen={isOpen}
        edgeToggle={appearance.sidebarToggle === "edge"}
        isSearchFocused={isSearchFocused}
        everything={everything}
        onClose={() => setIsOpen(false)}
        footer={
          <>
            <AddMenu
              collapsible={codexSidebar}
              compact={codexSidebar && !isOpen}
              open={capture.isAdding}
              mode={capture.captureMode}
              saving={capture.isCapturing}
              error={capture.isAdding ? captureError : null}
              onOpen={() => capture.openCapture()}
              onClose={capture.closeCaptureModal}
              onModeChange={capture.changeCaptureMode}
              onSaveNote={capture.saveNote}
              onSaveLink={capture.saveLink}
              onSaveQuote={capture.saveQuote}
              onPickFile={(files) => capture.captureFiles(files, "file picker")}
              onScreenshot={capture.startScreenshotCapture}
              onAddSpace={codexSidebar ? spaces.openSpaceDraft : undefined}
            />
            <UpdateNavRow update={update} />
            <NavRow
              tone="footer"
              active={isSettingsOpen}
              aria-label="Settings"
              aria-expanded={isSettingsOpen}
              aria-controls="settings-modal"
              data-tooltip="Settings"
              onClick={onOpenSettings}
            >
              <HugeiconsIcon icon={Settings01Icon} size={15} />
              <span className={navLabelClass}>Settings</span>
            </NavRow>
          </>
        }
      >
        <SpacesSection
          experimental={codexSidebar}
          collapsed={codexSidebar && !isOpen}
          spaces={spaces.spaces}
          activeSpaceId={activeSpaceId}
          activeCount={activeCount}
          renaming={spaces.renaming}
          actions={spaces.actions}
          draftNameInputRef={spaces.draftNameInputRef}
          draft={spaces.draft}
        />
        {isOpen && spaces.sidebarActionError && (
          <SidebarError
            message={spaces.sidebarActionError}
            collapsed={false}
            onDismiss={() => spaces.setSidebarActionError(null)}
          />
        )}
      </Sidebar>
      {/* A closed sidebar's grip would sit over an open item's stage. */}
      {!codexSidebar && appearance.sidebarToggle === "edge" && (isOpen || !hasOpenItem) && (
        <SidebarEdgeGrip isOpen={isOpen} onToggle={() => setIsOpen((open) => !open)} />
      )}
    </>
  );
}

// Classic closes to the window edge, so its way back, and any Space error,
// sit at the start of the capture bar.
export function ClosedSidebarControls({
  appearance,
  isOpen,
  setIsOpen,
  spaces,
}: {
  appearance: Appearance;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  spaces: ReturnType<typeof useSpaces>;
}) {
  if (appearance.sidebarStyle === "codex" || isOpen) return null;
  return (
    <>
      <SidebarOpenButton
        edgeToggle={appearance.sidebarToggle === "edge"}
        onOpen={() => setIsOpen(true)}
      />
      {spaces.sidebarActionError && (
        <SidebarError
          message={spaces.sidebarActionError}
          collapsed
          onDismiss={() => spaces.setSidebarActionError(null)}
        />
      )}
    </>
  );
}
