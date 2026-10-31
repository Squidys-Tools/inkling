import type { SpaceColor } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { color, radius } from "@inkling/ui/tokens.stylex";
import { SpaceMark } from "../../../renderer/src/shell/SpaceMark.tsx";

const spaces: { name: string; color: SpaceColor; holds: string; smart: boolean }[] = [
  { name: "Design references", color: "orange", holds: "Everything tagged reference", smart: true },
  { name: "Read later", color: "green", holds: "Articles tagged essay", smart: true },
  { name: "Cats", color: "yellow", holds: "Photos with a cat in them", smart: true },
  { name: "Weekend reading", color: "pink", holds: "The things you put there", smart: false },
];

export function Spaces() {
  return (
    <ul aria-label="Example Spaces" {...stylex.props(styles.list)}>
      {spaces.map((space) => (
        <li key={space.name} {...stylex.props(styles.row)}>
          <SpaceMark color={space.color} />
          <span {...stylex.props(styles.name)}>{space.name}</span>
          <span {...stylex.props(styles.holds)}>{space.holds}</span>
          <span {...stylex.props(styles.kind)}>{space.smart ? "Smart" : "Picked"}</span>
        </li>
      ))}
    </ul>
  );
}

const styles = stylex.create({
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    margin: 0,
    padding: "10px",
    borderRadius: radius.panel,
    backgroundColor: color.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    listStyle: "none",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    gridTemplateAreas: '"mark name kind" ". holds holds"',
    alignItems: "center",
    columnGap: "10px",
    rowGap: "2px",
    paddingBlock: "10px",
    paddingInline: "12px",
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
  },
  name: { gridArea: "name", color: color.ink, fontSize: "15px" },
  holds: { gridArea: "holds", color: color.muted, fontSize: "13px" },
  kind: { gridArea: "kind", color: color.faint, fontSize: "12px" },
});
