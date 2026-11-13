import GridViewIcon from "@hugeicons/core-free-icons/GridViewIcon";
import Layout01Icon from "@hugeicons/core-free-icons/Layout01Icon";
import SidebarLeftIcon from "@hugeicons/core-free-icons/SidebarLeftIcon";
import * as stylex from "@stylexjs/stylex";
import { SegmentedControl } from "@inkling/ui";
import { chrome } from "../desktop.ts";
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
  const { sidebar, gridColumns, windowControlsAtRest } = useAppearance();
  return (
    <Panel title="Appearance" onClose={onClose}>
      <PanelBody>
        <Row
          icon={SidebarLeftIcon}
          title="Sidebar"
          description="Cover shows each Space by its newest item, Strip by its four newest."
          action={
            <SegmentedControl
              name="appearance-sidebar"
              label="Sidebar style"
              options={appearanceOptions.sidebar}
              value={sidebar}
              onChange={(value) => setAppearance("sidebar", value)}
              style={[inset.capsule, styles.segmented]}
            />
          }
        />
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
        <Row
          icon={GridViewIcon}
          title="Grid columns"
          description="The library always shows this many columns. Cards grow and shrink with the window."
          action={
            <SegmentedControl
              name="appearance-grid-columns"
              label="Grid columns"
              options={appearanceOptions.gridColumns}
              value={gridColumns}
              onChange={(value) => setAppearance("gridColumns", value)}
              style={[inset.capsule, styles.segmented]}
            />
          }
        />
        {chrome.controls === "custom-right" && (
          <Row
            icon={Layout01Icon}
            title="Show window controls"
            description="Hidden until the pointer reaches the top-right corner, or drawn all the time."
            action={
              <SegmentedControl
                name="appearance-window-controls-at-rest"
                label="Window controls visibility"
                options={appearanceOptions.windowControlsAtRest}
                value={windowControlsAtRest}
                onChange={(value) => setAppearance("windowControlsAtRest", value)}
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
