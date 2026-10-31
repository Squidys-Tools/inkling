import { DropletIcon, Grid2X2Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { SegmentedControl } from "../../components/SegmentedControl/SegmentedControl";
import { type Appearance, APPEARANCE_OPTIONS } from "./appearance";
import { SETTINGS_SCROLL, SettingsHeader, SettingsPanel, SettingsRow } from "./SettingsPanel";

const SEGMENTED = "flex-none border border-[#221f1c] bg-surface";

export function AppearancePanel({
  appearance,
  onAppearanceChange,
  onClose,
}: {
  appearance: Appearance;
  onAppearanceChange: <Key extends keyof Appearance>(key: Key, value: Appearance[Key]) => void;
  onClose: () => void;
}) {
  return (
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
        <SettingsRow
          icon={DropletIcon}
          title="liquid glass"
          description="Refracting glass on the floating controls."
          action={
            <SegmentedControl
              className={SEGMENTED}
              name="appearance-liquid-glass"
              label="liquid glass"
              value={appearance.liquidGlass}
              onChange={(value) => onAppearanceChange("liquidGlass", value)}
              options={APPEARANCE_OPTIONS.liquidGlass}
            />
          }
        />
      </div>
    </SettingsPanel>
  );
}
