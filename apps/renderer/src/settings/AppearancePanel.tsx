import { GridViewIcon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { SegmentedControl } from "@inkling/ui";
import {
  setViewToggleStyle,
  useViewToggleStyle,
  viewToggleStyles,
} from "../libraryView/viewToggleStyle.ts";
import { inset, Panel, PanelBody, Row } from "./parts.tsx";

export function AppearancePanel({ onClose }: { onClose: () => void }) {
  const viewToggle = useViewToggleStyle();
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
      </PanelBody>
    </Panel>
  );
}

const styles = stylex.create({
  segmented: { flexShrink: 0 },
});
