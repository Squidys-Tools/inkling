import * as stylex from "@stylexjs/stylex";
import { SegmentedControl } from "@inkling/ui";
import { chrome } from "../desktop.ts";
import { setAppearance, useAppearance } from "./appearance.ts";
import { appearanceOptions } from "./appearanceModel.ts";
import { CardRow, inset, Panel, PanelBody, Section } from "./parts.tsx";

export function AppearancePanel({ onClose }: { onClose: () => void }) {
  const { sidebar, gridColumns, windowControlsAtRest } = useAppearance();
  const capsule = [inset.capsule, inset.onCard, styles.segmented];
  return (
    <Panel title="Appearance" note="How the library and the window look." onClose={onClose}>
      <PanelBody>
        <Section label="Library">
          <CardRow
            title="Sidebar"
            description="Cover shows each Space by its newest item. Strip shows its four newest."
            action={
              <SegmentedControl
                name="appearance-sidebar"
                label="Sidebar style"
                options={appearanceOptions.sidebar}
                value={sidebar}
                onChange={(value) => setAppearance("sidebar", value)}
                style={capsule}
              />
            }
          />
          <CardRow
            title="Grid columns"
            description="The library always shows this many. Cards grow and shrink with the window."
            action={
              <SegmentedControl
                name="appearance-grid-columns"
                label="Grid columns"
                options={appearanceOptions.gridColumns}
                value={gridColumns}
                onChange={(value) => setAppearance("gridColumns", value)}
                style={capsule}
              />
            }
          />
        </Section>
        {chrome.controls === "custom-right" && (
          <Section label="Window">
            <CardRow
              title="Window buttons"
              description="Hidden until the pointer reaches the top-right corner, or always drawn."
              action={
                <SegmentedControl
                  name="appearance-window-controls-at-rest"
                  label="Window controls visibility"
                  options={appearanceOptions.windowControlsAtRest}
                  value={windowControlsAtRest}
                  onChange={(value) => setAppearance("windowControlsAtRest", value)}
                  style={capsule}
                />
              }
            />
          </Section>
        )}
      </PanelBody>
    </Panel>
  );
}

const styles = stylex.create({
  segmented: { flexShrink: 0 },
});
