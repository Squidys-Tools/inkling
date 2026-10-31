import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius } from "@inkling/ui/tokens.stylex";

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <div {...stylex.props(styles.box)}>
      <div {...stylex.props(styles.icon)}>
        <HugeiconsIcon icon={Search01Icon} size={20} />
      </div>
      <h2 {...stylex.props(styles.title)}>{title}</h2>
      <p {...stylex.props(styles.detail)}>{detail}</p>
      {action && (
        <button type="button" onClick={action.run} {...stylex.props(styles.action)}>
          {action.label}
        </button>
      )}
    </div>
  );
}

const styles = stylex.create({
  box: {
    position: "absolute",
    top: "132px",
    left: "14px",
    right: "14px",
    paddingBlock: "80px",
    paddingInline: "20px",
    borderRadius: radius.panel,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.border,
    textAlign: "center",
  },
  icon: {
    display: "grid",
    placeItems: "center",
    width: "42px",
    height: "42px",
    marginInline: "auto",
    marginBottom: "16px",
    borderRadius: radius.round,
    backgroundColor: color.surface,
    color: color.muted,
  },
  title: {
    margin: 0,
    fontFamily: font.quote,
    fontSize: "24px",
    fontWeight: 400,
    letterSpacing: "-0.04em",
    color: color.ink,
  },
  detail: {
    marginTop: "9px",
    marginBottom: "17px",
    marginInline: 0,
    fontSize: "13px",
    color: color.muted,
  },
  action: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontSize: "13px",
    color: color.accent,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
});
