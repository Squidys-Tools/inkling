import { Tabs } from "@base-ui/react/tabs";
import {
  Archive01Icon,
  Database02Icon,
  Grid2X2Icon,
  LicenseThirdPartyIcon,
  Link01Icon,
  PaintBoardIcon,
  PlayIcon,
  Settings01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps, RefObject } from "react";
import { SegmentedControl } from "../../components/SegmentedControl/SegmentedControl";
import { ArchivePanel } from "./ArchivePanel";
import { type Appearance, APPEARANCE_OPTIONS } from "./appearance";
import { ExtensionPairing } from "./ExtensionPairing";
import { LibraryPanel } from "./LibraryPanel";
import { OpenSourceLicenses } from "./OpenSourceLicenses";
import {
  pillButton,
  SETTINGS_SCROLL,
  SettingsHeader,
  SettingsPanel,
  SettingsRow,
} from "./SettingsPanel";
import type { SettingsTab } from "./useSettings";
import { UpdateSettings } from "./UpdateSettings";
import { ScreenshotImportSettings } from "./ScreenshotImportSettings";

const EASE = [0.23, 1, 0.32, 1] as const;

const TAB =
  "flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-row border-0 bg-transparent px-2.5 py-0 text-left font-body text-[14px]/[18px] font-normal text-ink-soft transition-[color,scale] duration-180 ease-[ease] hover:text-ink active:scale-98 data-active:font-medium data-active:text-ink motion-reduce:transition-none [&_svg]:shrink-0 [&_svg]:text-muted data-active:[&_svg]:text-ink";

const SEGMENTED = "flex-none border border-[#221f1c] bg-surface";

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
  open,
  dialogRef,
  tab,
  onTabChange,
  onClose,
  appVersion,
  appearance,
  onAppearanceChange,
  onShowWelcome,
  archive,
  library,
  update,
}: {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  appVersion: string | null;
  appearance: Appearance;
  onAppearanceChange: <Key extends keyof Appearance>(key: Key, value: Appearance[Key]) => void;
  onShowWelcome: () => void;
  archive: Omit<ComponentProps<typeof ArchivePanel>, "onClose">;
  library: Omit<ComponentProps<typeof LibraryPanel>, "onClose">;
  update: ComponentProps<typeof UpdateSettings>["update"];
}) {
  return (
    <AnimatePresence>
      {open && (
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
                ref={dialogRef}
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
                  count={archive.isLoaded ? archive.items.length : undefined}
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
              <SettingsPanel tab="general" titleId="general-panel-title">
                <SettingsHeader
                  titleId="general-panel-title"
                  title="General"
                  note="How inkling behaves across the app."
                  onClose={onClose}
                />
                <div className={SETTINGS_SCROLL}>
                  <UpdateSettings update={update} />
                  <ScreenshotImportSettings />
                  <SettingsRow
                    icon={PlayIcon}
                    title="Welcome tour"
                    description="Replay the screens from your first launch: saving things, finding them again, and keeping your library on this computer."
                    action={
                      <button type="button" className={pillButton()} onClick={onShowWelcome}>
                        Show the welcome again
                      </button>
                    }
                  />
                  <SettingsRow
                    icon={LicenseThirdPartyIcon}
                    title="Open source licenses"
                    description="The projects inkling is built on, and the terms they come with."
                    action={
                      <button
                        type="button"
                        className={pillButton()}
                        onClick={() => onTabChange("licenses")}
                      >
                        View licenses
                      </button>
                    }
                  />
                </div>
              </SettingsPanel>
            )}

            <SettingsPanel tab="appearance" titleId="appearance-panel-title">
              <SettingsHeader
                titleId="appearance-panel-title"
                title="Appearance"
                note="Try other looks for parts of the app."
                onClose={onClose}
              />
              <div className={SETTINGS_SCROLL}>
                <SettingsRow
                  icon={SidebarLeftIcon}
                  title="Sidebar style"
                  description="Classic or an experimental compact navigation."
                  action={
                    <SegmentedControl
                      className={SEGMENTED}
                      name="appearance-sidebar-style"
                      label="Sidebar style"
                      value={appearance.sidebarStyle}
                      onChange={(value) => onAppearanceChange("sidebarStyle", value)}
                      options={APPEARANCE_OPTIONS.sidebarStyle}
                    />
                  }
                />
                <SettingsRow
                  icon={Grid2X2Icon}
                  title="Grid and list toggle"
                  description="The switch at the bottom of the library."
                  action={
                    <SegmentedControl
                      className={SEGMENTED}
                      name="appearance-view-toggle"
                      label="Grid and list toggle style"
                      value={appearance.viewToggle}
                      onChange={(value) => onAppearanceChange("viewToggle", value)}
                      options={APPEARANCE_OPTIONS.viewToggle}
                    />
                  }
                />
                <SettingsRow
                  icon={SidebarLeftIcon}
                  title="Sidebar button"
                  description="How the sidebar opens and closes."
                  action={
                    <SegmentedControl
                      className={SEGMENTED}
                      name="appearance-sidebar-toggle"
                      label="Sidebar button style"
                      value={appearance.sidebarToggle}
                      onChange={(value) => onAppearanceChange("sidebarToggle", value)}
                      options={APPEARANCE_OPTIONS.sidebarToggle}
                    />
                  }
                />
              </div>
            </SettingsPanel>

            <ArchivePanel {...archive} onClose={onClose} />
            <LibraryPanel {...library} onClose={onClose} />

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
