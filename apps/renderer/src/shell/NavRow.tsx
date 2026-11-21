import * as stylex from "@stylexjs/stylex";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { railRow } from "./railRow.stylex.ts";

type RowLook = { active?: boolean; tone?: "nav" | "footer"; compact: boolean; rail?: boolean };

/** A selected sidebar row's fill, drawn inside the row so it scrolls and drags with it. */
export function SelectionFill({
  rail = false,
}: {
  /** Closing shrinks the fill to the rail control's spot before the frame edge reaches it. */
  rail?: boolean;
} = {}) {
  return (
    <span
      data-selection-fill
      aria-hidden="true"
      {...stylex.props(styles.fill, rail && styles.railFill)}
    />
  );
}

/** A sidebar destination keeps its name when only its icon is visible. */
export function NavLink({
  active = false,
  tone = "nav",
  compact,
  rail = compact,
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
  /** Its selection glides from the sidebar's last selected row. */
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
      data-glide={glide}
      data-sidebar-nav
      {...stylex.props(
        styles.row,
        styles[tone],
        compact && styles.compact,
        compact && styles.compactTone,
        active && styles.active,
        active && slides && styles.slid,
      )}
    >
      {active && slides && <SelectionFill rail={rail && !compact} />}
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
        compact && styles.compactTone,
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
    gap: "11px",
    // Every rail control is centered on the rail column and this tall, so each takes the same click.
    height: railRow.height,
    minWidth: 0,
    flexGrow: 1,
    paddingLeft: "11px",
    paddingRight: "10px",
    borderRadius: radius.control,
    // Keyboard focus lights the row like a hover; a ring would sit on the selected row too.
    backgroundColor: {
      default: "transparent",
      ":hover": color.overlayActive,
      ":focus-visible": color.overlayActive,
    },
    lineHeight: "18px",
    textDecoration: "none",
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    transitionProperty: "color, background-color, transform",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.enter,
    outline: "none",
  },
  compact: {
    width: "38px",
    flexGrow: 0,
    marginInline: "auto",
    justifyContent: "center",
    paddingLeft: 0,
    paddingRight: 0,
    borderRadius: radius.tile,
  },
  compactTone: {
    color: { default: color.inkSoft, ":hover": color.inkStrong, ":focus-visible": color.inkStrong },
  },
  button: { width: "100%", borderWidth: 0, fontFamily: font.body, textAlign: "left" },
  nav: { fontSize: "14px", color: { default: color.inkSoft, ":hover": color.inkStrong } },
  footer: { fontSize: "13px", color: { default: color.muted, ":hover": color.ink } },
  active: {
    fontWeight: 600,
    backgroundColor: { default: color.hover, ":hover": color.hover },
    color: { default: color.inkStrong, ":hover": color.inkStrong },
  },
  slid: {
    position: "relative",
    isolation: "isolate",
    backgroundColor: { default: "transparent", ":hover": "transparent" },
  },
  // Under the row's content: z-index -1 inside the row's own stacking context.
  fill: {
    position: "absolute",
    inset: 0,
    zIndex: -1,
    borderRadius: "inherit",
    backgroundColor: color.hover,
    pointerEvents: "none",
  },
  railFill: { left: "1px", right: "auto", width: "38px", borderRadius: radius.tile },
  icon: {
    display: "grid",
    placeItems: "center",
    width: "18px",
    flexShrink: 0,
    color: "currentColor",
  },
  activeIcon: { color: color.inkStrong },
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
