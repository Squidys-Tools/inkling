import * as stylex from "@stylexjs/stylex";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";

type RowLook = { active?: boolean; tone?: "nav" | "footer"; compact: boolean };

/** How a selected row is filled: by the sidebar's sliding pill, or by itself. */
export const slidingSelection = (selected: boolean) => (selected ? "" : undefined);

/** A sidebar destination keeps its name when only its icon is visible. */
export function NavLink({
  active = false,
  tone = "nav",
  compact,
  icon,
  label,
  count,
  slides = false,
  glide,
  onClick,
  ...link
}: RowLook & {
  icon: ReactNode;
  label: string;
  count?: ReactNode;
  /** The sidebar's sliding pill draws this row's selection. */
  slides?: boolean;
  /** Its id for the sidebar's open and close glide. */
  glide?: string;
  onClick?: () => void;
} & Pick<LinkProps, "to" | "params">) {
  return (
    <Link
      {...link}
      // A dragged link would leave the window as a URL, and it is not one the user saved.
      draggable={false}
      onClick={onClick}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      aria-current={active ? "page" : undefined}
      data-sidebar-selected={slidingSelection(active && slides)}
      data-glide={glide}
      {...stylex.props(
        styles.row,
        styles[tone],
        compact && styles.compact,
        active && styles.active,
        active && slides && styles.slid,
      )}
    >
      <span {...stylex.props(styles.icon, active && styles.activeIcon)}>{icon}</span>
      {!compact && (
        <span data-sidebar-label {...stylex.props(styles.label)}>
          {label}
        </span>
      )}
      {!compact && count !== undefined && (
        <span data-sidebar-label {...stylex.props(styles.count)}>
          {typeof count === "number" ? count.toLocaleString() : count}
        </span>
      )}
    </Link>
  );
}

export function NavButton({
  tone = "footer",
  active = false,
  compact,
  icon,
  label,
  description,
  disabled = false,
  expanded,
  controls,
  onClick,
}: RowLook & {
  icon: ReactNode;
  label: string;
  description?: string;
  disabled?: boolean;
  /** The overlay this row owns, for aria-expanded/aria-controls. */
  expanded?: boolean;
  controls?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={description ?? (compact ? label : undefined)}
      aria-label={compact ? label : undefined}
      disabled={disabled}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      {...stylex.props(
        styles.row,
        styles.button,
        styles[tone],
        compact && styles.compact,
        active && styles.active,
      )}
    >
      <span {...stylex.props(styles.icon, active && styles.activeIcon)}>{icon}</span>
      {!compact && (
        <span data-sidebar-label {...stylex.props(styles.label)}>
          {label}
        </span>
      )}
    </button>
  );
}

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    height: "32px",
    minWidth: 0,
    flexGrow: 1,
    paddingLeft: "18px",
    paddingRight: "10px",
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    lineHeight: "18px",
    textDecoration: "none",
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.985)" },
    transitionProperty: "color, background-color, transform",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.enter,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  compact: { justifyContent: "center", paddingLeft: 0, paddingRight: 0 },
  button: { width: "100%", borderWidth: 0, fontFamily: font.body, textAlign: "left" },
  nav: { fontSize: "14px", color: { default: color.inkSoft, ":hover": color.ink } },
  footer: { fontSize: "13px", color: { default: color.muted, ":hover": color.ink } },
  active: {
    fontWeight: 600,
    backgroundColor: { default: color.overlayActive, ":hover": color.overlayActive },
    color: { default: color.inkStrong, ":hover": color.inkStrong },
  },
  slid: { backgroundColor: { default: "transparent", ":hover": "transparent" } },
  icon: { display: "grid", placeItems: "center", width: "16px", flexShrink: 0, color: color.muted },
  activeIcon: { color: color.accent },
  label: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  count: {
    display: "flex",
    justifyContent: "flex-end",
    width: "40px",
    flexShrink: 0,
    fontFamily: font.mono,
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 400,
    color: color.muted,
  },
});
