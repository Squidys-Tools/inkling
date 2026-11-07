import LicenseThirdPartyIcon from "@hugeicons/core-free-icons/LicenseThirdPartyIcon";
import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import { Panel, PanelBody, Row, TextAction } from "./parts.tsx";

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
          action={<TextAction onClick={onShowWelcome}>Show the welcome again</TextAction>}
        />
        <Row
          icon={LicenseThirdPartyIcon}
          title="Open source licenses"
          description="The projects inkling is built on, and the terms they come with."
          action={<TextAction onClick={onShowLicenses}>View licenses</TextAction>}
        />
      </PanelBody>
    </Panel>
  );
}
