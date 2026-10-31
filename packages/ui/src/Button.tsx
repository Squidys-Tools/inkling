import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { color, font, motion, radius, space, text } from "./tokens.stylex.ts";

type Variant = "primary" | "quiet" | "outline" | "danger";

type ButtonProps = Omit<ComponentProps<"button">, "className" | "style"> & {
  variant?: Variant;
  icon?: ReactNode;
  style?: stylex.StyleXStyles;
};

export function Button({
  variant = "quiet",
  icon,
  children,
  style,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} {...props} {...stylex.props(styles.base, styles[variant], style)}>
      {icon}
      {children}
    </button>
  );
}

type IconButtonProps = Omit<ComponentProps<"button">, "className" | "style" | "children"> & {
  /** Required: an icon alone has no name for screen readers. */
  label: string;
  icon: ReactNode;
  active?: boolean;
  style?: stylex.StyleXStyles;
};

export function IconButton({
  label,
  icon,
  active,
  style,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...props}
      {...stylex.props(styles.base, styles.quiet, styles.icon, active && styles.active, style)}
    >
      {icon}
    </button>
  );
}

const styles = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s2,
    height: "32px",
    paddingInline: space.s3,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    fontFamily: font.body,
    fontSize: text.md,
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
    transitionProperty: "background-color, color, border-color, opacity",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.standard,
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${color.accent}`,
    },
    outlineOffset: "2px",
    opacity: { default: 1, ":disabled": 0.45 },
    pointerEvents: { default: "auto", ":disabled": "none" },
  },
  primary: {
    backgroundColor: { default: color.accent, ":hover": color.accentStrong },
    color: color.onAccent,
  },
  quiet: {
    backgroundColor: {
      default: "transparent",
      ":hover": color.overlayHover,
      ":active": color.overlayActive,
    },
    color: { default: color.inkSoft, ":hover": color.inkStrong },
  },
  outline: {
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    borderColor: color.border,
    color: color.ink,
  },
  danger: {
    backgroundColor: { default: color.dangerSoft, ":hover": color.danger },
    color: { default: color.danger, ":hover": color.onAccent },
  },
  icon: {
    width: "32px",
    paddingInline: 0,
  },
  active: {
    backgroundColor: color.overlayActive,
    color: color.inkStrong,
  },
});
