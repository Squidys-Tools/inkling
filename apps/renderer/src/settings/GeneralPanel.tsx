import { LicenseThirdPartyIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { Panel, PanelBody, Pill, Row } from "./parts.tsx";

export function GeneralPanel({
  onShowWelcome,
  onShowLicenses,
  onClose,
}: {
  onShowWelcome: () => void;
  onShowLicenses: () => void;
  onClose: () => void;
}) {
  return (
    <Panel title="General" note="How inkling behaves across the app." onClose={onClose}>
      <PanelBody>
        <Row
          icon={PlayIcon}
          title="Welcome tour"
          description="Replay the screens from your first launch: saving things, finding them again, and keeping your library on this computer."
          action={<Pill onClick={onShowWelcome}>Show the welcome again</Pill>}
        />
        <Row
          icon={LicenseThirdPartyIcon}
          title="Open source licenses"
          description="The projects inkling is built on, and the terms they come with."
          action={<Pill onClick={onShowLicenses}>View licenses</Pill>}
        />
      </PanelBody>
    </Panel>
  );
}
