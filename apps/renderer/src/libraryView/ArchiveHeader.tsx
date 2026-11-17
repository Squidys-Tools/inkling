import * as stylex from "@stylexjs/stylex";
import { Button } from "@inkling/ui";
import { color, font, space } from "@inkling/ui/tokens.stylex";
import { deleteArchive } from "../cards/cardActions.ts";

/** The archive's title, its count, and the one way to empty it. */
export function ArchiveHeader({ count }: { count: number }) {
  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.heading)}>
        <h1 {...stylex.props(styles.title)}>Archive</h1>
        <p {...stylex.props(styles.note)}>
          {count.toLocaleString()} {count === 1 ? "item" : "items"}, kept until you restore or
          delete them
        </p>
      </div>
      <Button variant="danger" onClick={() => void deleteArchive(count)} style={styles.deleteAll}>
        Delete all…
      </Button>
    </header>
  );
}

const styles = stylex.create({
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.s6,
    height: "100%",
    paddingInline: "4px",
    paddingBottom: "18px",
    boxSizing: "border-box",
  },
  heading: { display: "flex", flexDirection: "column", gap: space.s1, minWidth: 0 },
  title: {
    margin: 0,
    fontFamily: font.display,
    fontSize: "28px",
    lineHeight: "34px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: color.ink,
  },
  note: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: "18px",
    color: color.muted,
  },
  deleteAll: {
    flex: "none",
    backgroundColor: { default: "transparent", ":hover": color.dangerSoft },
    color: color.danger,
  },
});
