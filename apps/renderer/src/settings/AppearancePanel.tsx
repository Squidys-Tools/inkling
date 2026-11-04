import { GridViewIcon, Layout01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { SegmentedControl } from "@inkling/ui";
import { desktop, platform } from "../desktop.ts";
import {
  setViewToggleStyle,
  useViewToggleStyle,
  viewToggleStyles,
} from "../libraryView/viewToggleStyle.ts";
import { setAppearance, useAppearance } from "./appearance.ts";
import { appearanceOptions } from "./appearanceModel.ts";
import { inset, Panel, PanelBody, Row } from "./parts.tsx";

export function AppearancePanel({ onClose }: { onClose: () => void }) {
  const viewToggle = useViewToggleStyle();
  const { windowControls } = useAppearance();
  return (
    <Panel title="Appearance" onClose={onClose}>
      <PanelBody>
        <Row
          icon={GridViewIcon}
          title="Grid and list toggle"
          description="The switch at the bottom of the library."
          action={
            <SegmentedControl
              name="appearance-view-toggle"
              label="Grid and list toggle style"
              options={viewToggleStyles}
              value={viewToggle}
              onChange={setViewToggleStyle}
              style={[inset.capsule, styles.segmented]}
            />
          }
        />
        {desktop && platform === "darwin" && (
          <Row
            icon={Layout01Icon}
            title="Window controls"
            description="Traffic lights, or the inset pill Windows and Linux use."
            action={
              <SegmentedControl
                name="appearance-window-controls"
                label="Window controls style"
                options={appearanceOptions.windowControls}
                value={windowControls}
                onChange={(value) => setAppearance("windowControls", value)}
                style={[inset.capsule, styles.segmented]}
              />
            }
          />
        )}
      </PanelBody>
    </Panel>
  );
}

const styles = stylex.create({
  segmented: { flexShrink: 0 },
});
