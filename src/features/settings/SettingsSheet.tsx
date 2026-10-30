import { Tabs } from "@base-ui/react/tabs";
import {
  Archive01Icon,
  Database02Icon,
  Link01Icon,
  PaintBoardIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps } from "react";
import type { LibraryItem } from "../../lib/types";
import type { LibraryCardContext } from "../library/LibraryCard";
import { ArchivePanel } from "./ArchivePanel";
import { AppearancePanel } from "./AppearancePanel";
import { ExtensionPairing } from "./ExtensionPairing";
import { LibraryPanel } from "./LibraryPanel";
import { OpenSourceLicenses } from "./OpenSourceLicenses";
import { GeneralPanel } from "./GeneralPanel";
import { SETTINGS_SCROLL, SettingsHeader, SettingsPanel } from "./SettingsPanel";
import type { useArchive } from "./useArchive";
import { showLibraryFolderFromSettings, type useLibraryTransfer } from "./useLibraryTransfer";
import type { SettingsTab, useSettings } from "./useSettings";
import type { UpdateSettings } from "./UpdateSettings";

const EASE = [0.23, 1, 0.32, 1] as const;

const TAB =
  "flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-row border-0 bg-transparent px-2.5 py-0 text-left font-body text-[14px]/[18px] font-normal text-ink-soft transition-[color,scale] duration-180 ease-[ease] hover:text-ink active:scale-98 data-active:font-medium data-active:text-ink motion-reduce:transition-none [&_svg]:shrink-0 [&_svg]:text-muted data-active:[&_svg]:text-ink";

function RailTab({
  value,
  icon,
  label,
  count,
  onClick,
}: {
  value: SettingsTab;
  icon: IconSvgElement;
  label: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <Tabs.Tab value={value} className={TAB} onClick={onClick}>
      <HugeiconsIcon icon={icon} size={15} />
      <span className="flex-1">{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[12px]/4 font-normal text-muted">{count}</span>
      )}
    </Tabs.Tab>
  );
}

export function SettingsSheet({
  settings: {
    isSettingsOpen,
    setIsSettingsOpen,
    settingsDialogRef,
    settingsTab: tab,
    setSettingsTab: onTabChange,
    appearance,
    setAppearanceOption,
    appVersion,
    wholeLibraryKinds,
    librarySizeBytes,
    lastCopy,
  },
  update,
  onShowWelcome,
  archive,
  transfer,
  items,
  canUseDesktopBackend,
  onSelectArchivedItem,
  onOpenReader,
  onRetryJob,
}: {
  settings: ReturnType<typeof useSettings>;
  update: ComponentProps<typeof UpdateSettings>["update"];
  onShowWelcome: () => void;
  archive: ReturnType<typeof useArchive>;
  transfer: ReturnType<typeof useLibraryTransfer>;
  items: LibraryItem[];
  canUseDesktopBackend: boolean;
  onSelectArchivedItem: LibraryCardContext["onSelectItem"];
  onOpenReader: LibraryCardContext["onOpenReader"];
  onRetryJob: LibraryCardContext["onRetryJob"];
}) {
  const onClose = () => setIsSettingsOpen(false);
  return (
    <AnimatePresence>
      {isSettingsOpen && (
        <motion.div
          key="settings-modal-backdrop"
          className="fixed inset-0 z-110 grid place-items-center bg-[rgba(8,8,7,0.74)] px-[clamp(var(--spacing-component),3vw,48px)] py-[clamp(var(--spacing-component),4vh,40px)] max-[700px]:p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <Tabs.Root
            value={tab === "licenses" ? "general" : tab}
            onValueChange={(value: SettingsTab) => onTabChange(value)}
            orientation="vertical"
            render={
              <motion.section
                ref={settingsDialogRef}
                id="settings-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-modal-title"
                tabIndex={-1}
                initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
                animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                exit={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
                transition={{ duration: 0.24, ease: EASE }}
              />
            }
            // The dialog takes focus on open; index.css's unlayered focus ring
            // outranks a plain utility.
            className="flex h-[min(640px,100%)] min-h-0 w-[min(1080px,100%)] overflow-hidden rounded-overlay border border-border bg-app text-ink shadow-[0_30px_80px_rgba(0,0,0,0.55)] focus:outline-none! max-[700px]:h-[min(720px,100%)] max-[700px]:flex-col max-[700px]:rounded-[18px]"
          >
            <aside
              className="flex w-[232px] min-w-[232px] min-h-0 shrink-0 flex-col px-3 pt-[22px] pb-[18px] max-[700px]:w-auto max-[700px]:min-w-0 max-[700px]:px-3.5 max-[700px]:pt-3.5 max-[700px]:pb-3"
              aria-label="Settings sections"
            >
              <header className="px-2.5 pt-1 pb-[18px] max-[700px]:px-1 max-[700px]:pt-0 max-[700px]:pb-3">
                <h2
                  id="settings-modal-title"
                  className="m-0 font-sans text-[15px]/5 font-semibold text-ink"
                >
                  Settings
                </h2>
              </header>
              <Tabs.List className="flex flex-col gap-0.5" activateOnFocus>
                {/* Stays selected under Licenses, so a press has to lead back itself. */}
                <RailTab
                  value="general"
                  icon={Settings01Icon}
                  label="General"
                  onClick={() => onTabChange("general")}
                />
                <RailTab value="appearance" icon={PaintBoardIcon} label="Appearance" />
                <RailTab value="data" icon={Database02Icon} label="Library" />
                <RailTab
                  value="archive"
                  icon={Archive01Icon}
                  label="Archive"
                  count={archive.isArchiveLoaded ? archive.archivedItems.length : undefined}
                />
                <RailTab value="extension" icon={Link01Icon} label="Browser extension" />
              </Tabs.List>
              <div className="mt-auto flex flex-col gap-1 px-2.5">
                {appVersion && (
                  <p className="m-0 font-mono text-[11px]/[14px] font-normal text-[#5e5850]">
                    inkling {appVersion}
                  </p>
                )}
              </div>
            </aside>

            {tab === "licenses" ? (
              <OpenSourceLicenses onBack={() => onTabChange("general")} onClose={onClose} />
            ) : (
              <GeneralPanel
                update={update}
                onShowWelcome={onShowWelcome}
                onShowLicenses={() => onTabChange("licenses")}
                onClose={onClose}
              />
            )}

            <AppearancePanel
              appearance={appearance}
              onAppearanceChange={setAppearanceOption}
              onClose={onClose}
            />

            <ArchivePanel
              items={archive.archivedItems}
              isLoaded={archive.isArchiveLoaded}
              selectionMode={archive.isArchiveSelectionMode}
              selectedCount={archive.selectedArchivedIds.size}
              onSelectItem={onSelectArchivedItem}
              onOpenReader={onOpenReader}
              onRetryJob={onRetryJob}
              onDeleteItem={archive.deleteArchivedLibraryItem}
              onRestoreItem={archive.restoreArchivedLibraryItem}
              isItemSelected={archive.isArchivedLibraryItemSelected}
              onToggleItem={archive.toggleArchivedLibraryItem}
              onToggleSelectionMode={archive.toggleArchiveSelectionMode}
              onRestoreSelected={() => void archive.restoreSelectedArchivedItems()}
              onDeleteSelected={() => void archive.deleteSelectedArchivedItems()}
              onClose={onClose}
            />
            <LibraryPanel
              kinds={wholeLibraryKinds ?? items.map((item) => item.kind)}
              sizeBytes={librarySizeBytes}
              canUseFolderPicker={canUseDesktopBackend}
              onShowFolder={showLibraryFolderFromSettings}
              lastCopy={lastCopy}
              lastExport={transfer.lastExport}
              lastImport={transfer.lastImport}
              isExporting={transfer.isExportingLibrary}
              isImporting={transfer.isImportingLibrary}
              onExport={() => void transfer.exportLibraryToFolder()}
              onImport={() => void transfer.importLibraryFromFolder()}
              onClose={onClose}
            />

            <SettingsPanel tab="extension" titleId="extension-panel-title">
              <SettingsHeader
                titleId="extension-panel-title"
                title="Browser extension"
                note="Save pages without leaving the browser"
                onClose={onClose}
              />
              <div className={SETTINGS_SCROLL}>
                <ExtensionPairing />
              </div>
            </SettingsPanel>
          </Tabs.Root>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
