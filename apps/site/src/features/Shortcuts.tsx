import { bindingLabel, bindingsFor, shortcuts } from "@inkling/contracts/shortcuts";
import { Kbd } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color } from "@inkling/ui/tokens.stylex";
import { usePlatform } from "../parts/platform.ts";

const commands = Object.keys(shortcuts) as (keyof typeof shortcuts)[];

/** The app's own shortcut table, in the visitor's system's keys. */
export function Shortcuts() {
  const platform = usePlatform() ?? "win32";
  return (
    <dl {...stylex.props(styles.list)}>
      {commands.map((command) => (
        <div key={command} {...stylex.props(styles.row)}>
          <dt>{shortcuts[command].label}</dt>
          <dd {...stylex.props(styles.keys)}>
            {bindingsFor(command, platform).map((binding) => (
              <Kbd key={bindingLabel(binding, platform)}>{bindingLabel(binding, platform)}</Kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const styles = stylex.create({
  list: {
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", "@media (max-width: 760px)": "1fr" },
    columnGap: "48px",
    margin: 0,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    minHeight: "48px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
    color: color.ink,
    fontSize: "16px",
  },
  keys: { display: "flex", gap: "6px", margin: 0 },
});
