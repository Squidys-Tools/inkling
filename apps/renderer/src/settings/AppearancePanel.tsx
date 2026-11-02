import { GridViewIcon } from "@hugeicons/core-free-icons";
import { SegmentedControl } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color } from "@inkling/ui/tokens.stylex";
import {
  setViewToggleStyle,
  useViewToggleStyle,
  viewToggleStyles,
} from "../libraryView/viewToggleStyle.ts";
import { Panel, PanelBody, Row } from "./parts.tsx";

export function AppearancePanel({ onClose }: { onClose: () => void }) {
  const viewToggle = useViewToggleStyle();
  return (
    <Panel title="Appearance" note="How parts of the app look." onClose={onClose}>
      <PanelBody>
        <Row
          icon={GridViewIcon}
          title="Grid and list toggle"
          description="The switch at the bottom of the library."
          action={
            <SegmentedControl
              name="appearance-view-toggle"
              label="Grid and list toggle style"
              value={viewToggle}
              options={viewToggleStyles}
              onChange={setViewToggleStyle}
              style={styles.segmented}
            />
          }
        />
      </PanelBody>
    </Panel>
  );
}

const styles = stylex.create({
  segmented: {
    width: "fit-content",
    maxWidth: "100%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
  },
});
