import { LicenseThirdPartyIcon, PlayIcon } from "@hugeicons/core-free-icons";
import type { ComponentProps } from "react";
import {
  pillButton,
  SETTINGS_SCROLL,
  SettingsHeader,
  SettingsPanel,
  SettingsRow,
} from "./SettingsPanel";
import { UpdateSettings } from "./UpdateSettings";

export function GeneralPanel({
  update,
  onShowWelcome,
  onShowLicenses,
  onClose,
}: {
  update: ComponentProps<typeof UpdateSettings>["update"];
  onShowWelcome: () => void;
  onShowLicenses: () => void;
  onClose: () => void;
}) {
  return (
    <SettingsPanel tab="general" titleId="general-panel-title">
      <SettingsHeader
        titleId="general-panel-title"
        title="General"
        note="How inkling behaves across the app."
        onClose={onClose}
      />
      <div className={SETTINGS_SCROLL}>
        <UpdateSettings update={update} />
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
            <button type="button" className={pillButton()} onClick={onShowLicenses}>
              View licenses
            </button>
          }
        />
      </div>
    </SettingsPanel>
  );
}
