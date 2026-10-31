import * as stylex from "@stylexjs/stylex";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";

type RowLook = { active?: boolean; tone?: "nav" | "footer" };

/** A sidebar row that goes somewhere: Everything, the archive, a page. */
export function NavLink({
  active = false,
  tone = "nav",
  icon,
  label,
  count,
  onClick,
  ...link
}: RowLook & {
  icon: ReactNode;
  label: string;
  count?: number;
  onClick?: () => void;
} & Pick<LinkProps, "to" | "params">) {
  return (
    <Link
      {...link}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      {...stylex.props(styles.row, styles[tone], active && styles.active)}
    >
      <span {...stylex.props(styles.icon, active && styles.activeIcon)}>{icon}</span>
      <span {...stylex.props(styles.label)}>{label}</span>
      {count !== undefined && <span {...stylex.props(styles.count)}>{count.toLocaleString()}</span>}
    </Link>
  );
}

/** A sidebar row that does something in place. */
export function NavButton({
  tone = "footer",
  icon,
  label,
  onClick,
}: RowLook & { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...stylex.props(styles.row, styles.button, styles[tone])}
    >
      <span {...stylex.props(styles.icon)}>{icon}</span>
      <span {...stylex.props(styles.label)}>{label}</span>
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
    paddingInline: "10px",
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    lineHeight: "18px",
    textDecoration: "none",
    cursor: "pointer",
    transform: { default: "none", ":active": "translateY(1px)" },
    transitionProperty: "color, background-color, transform",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  button: {
    width: "100%",
    borderWidth: 0,
    fontFamily: font.body,
    textAlign: "left",
  },
  nav: {
    fontSize: "14px",
    color: { default: color.inkSoft, ":hover": color.ink },
  },
  footer: {
    fontSize: "13px",
    color: { default: color.muted, ":hover": color.ink },
  },
  active: {
    fontWeight: 600,
    color: { default: color.inkStrong, ":hover": color.inkStrong },
  },
  icon: {
    display: "grid",
    placeItems: "center",
    width: "16px",
    flexShrink: 0,
    color: color.muted,
  },
  activeIcon: { color: color.accent },
  label: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  count: {
    width: "40px",
    flexShrink: 0,
    textAlign: "right",
    fontFamily: font.mono,
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 400,
    color: color.muted,
  },
});
