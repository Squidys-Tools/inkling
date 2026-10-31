import { Bookmark01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Glass } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, radius } from "@inkling/ui/tokens.stylex";
import { search } from "../library/search.ts";
import { openSpaceDraft } from "../shell/spaceDraft.ts";

/** Under the bar while a search is pinned: the query, how many matched, and a way to keep it. */
export function FilterRow({ query, count }: { query: string; count: number | null }) {
  return (
    <div {...stylex.props(styles.row)}>
      <Glass style={styles.chip}>
        <span {...stylex.props(styles.query)}>{query}</span>
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => search.clear()}
          {...stylex.props(styles.clear)}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} />
        </button>
      </Glass>
      <div {...stylex.props(styles.summary)}>
        {count !== null && (
          <span>
            {count.toLocaleString()} {count === 1 ? "result" : "results"}
          </span>
        )}
        <button type="button" onClick={() => openSpaceDraft(query)} {...stylex.props(styles.save)}>
          <HugeiconsIcon icon={Bookmark01Icon} size={13} /> Save as Space
        </button>
      </div>
    </div>
  );
}

const styles = stylex.create({
  row: {
    position: "absolute",
    top: "88px",
    left: "14px",
    right: "14px",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    height: "44px",
    paddingBottom: "6px",
    pointerEvents: "none",
  },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    minWidth: 0,
    height: "30px",
    paddingLeft: "10px",
    paddingRight: "8px",
    borderRadius: radius.round,
    pointerEvents: "auto",
  },
  query: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: "16px",
    fontWeight: 500,
    color: color.ink,
  },
  clear: {
    display: "grid",
    placeItems: "center",
    width: "16px",
    height: "16px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: "transparent",
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  summary: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: "12px",
    fontFamily: font.mono,
    fontSize: "12px",
    lineHeight: "16px",
    whiteSpace: "nowrap",
    color: color.muted,
  },
  save: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: font.body,
    fontSize: "12px",
    color: { default: color.accent, ":hover": cardColor.stampInk },
    cursor: "pointer",
    pointerEvents: "auto",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
});
