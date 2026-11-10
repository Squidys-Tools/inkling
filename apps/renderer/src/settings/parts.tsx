import XIcon from "@inkling/ui/icons/X";
import { Icon, type IconData } from "@inkling/ui";
import { Button } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import type { ComponentProps, ReactNode } from "react";

/** One settings section: a header with the close button, then a scrolling body. */
export function Panel({
  title,
  note,
  before,
  tools,
  onClose,
  children,
}: {
  title: string;
  note?: ReactNode;
  before?: ReactNode;
  tools?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="settings-panel-title" {...stylex.props(styles.panel)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          {before}
          <h2 id="settings-panel-title" {...stylex.props(styles.title)}>
            {title}
          </h2>
          {note && <p {...stylex.props(styles.note)}>{note}</p>}
        </div>
        <div {...stylex.props(styles.tools)}>
          {tools}
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            {...stylex.props(styles.close)}
          >
            <Icon icon={XIcon} size={16} strokeWidth={1.25} />
          </button>
        </div>
      </header>
      {children}
    </section>
  );
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.body)}>{children}</div>;
}

export function Row({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: IconData;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      <span aria-hidden="true" {...stylex.props(styles.rowIcon)}>
        <Icon icon={icon} size={17} />
      </span>
      <div {...stylex.props(styles.rowText)}>
        <h3 {...stylex.props(styles.rowTitle)}>{title}</h3>
        {description && <p {...stylex.props(styles.rowDescription)}>{description}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}

/** Stands in for a section that needs the desktop app. */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconData;
  title: string;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.empty)}>
      <div aria-hidden="true" {...stylex.props(styles.emptyIcon)}>
        <Icon icon={icon} size={19} />
      </div>
      <h3 {...stylex.props(styles.emptyTitle)}>{title}</h3>
      <p {...stylex.props(styles.emptyText)}>{children}</p>
    </div>
  );
}

type SquareButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "style"> & {
  look?: "plain" | "solid" | "danger";
};

/**
 * A settings button: a soft inset tile with mono text that lights up on hover. Solid marks a
 * row's main action; danger fills with the danger color on hover.
 */
export function SquareButton({ look = "plain", ...props }: SquareButtonProps) {
  return (
    <Button
      variant="outline"
      {...props}
      style={[styles.square, look !== "plain" && squareLooks[look]]}
    />
  );
}

/** A secondary step: underlined text beside a button or in a sentence. */
export function TextAction(props: Omit<ComponentProps<typeof Button>, "variant" | "style">) {
  return <Button variant="quiet" {...props} style={styles.textAction} />;
}

export const settingsText = stylex.create({
  mono: { fontFamily: font.mono, fontSize: text.sm, lineHeight: "16px", color: color.muted },
  hint: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: "16px",
    color: color.muted,
  },
  body: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "19px",
    color: color.muted,
  },
  status: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "19px",
    color: color.inkSoft,
  },
});

const squareLooks = stylex.create({
  solid: {
    borderColor: color.ink,
    backgroundColor: { default: color.ink, ":hover": color.inkStrong },
    color: color.surface,
    fontWeight: 600,
    boxShadow: "none",
  },
  danger: {
    color: { default: color.danger, ":hover": color.onAccent },
    borderColor: { default: color.glassEdge, ":hover": color.danger },
    backgroundColor: { default: color.surface, ":hover": color.danger },
  },
});

/** The inset capsule behind a group of choices, shared by every settings segmented control. */
export const inset = stylex.create({
  capsule: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.glassEdge,
    borderRadius: radius.tile,
    backgroundColor: color.surface,
    boxShadow: `inset 0 1px 0 ${color.glassEdge}`,
  },
});

const narrow = "@media (max-width: 700px)";

const styles = stylex.create({
  panel: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: "28px",
    minWidth: 0,
    minHeight: 0,
    paddingTop: { default: "28px", [narrow]: space.s5 },
    paddingRight: { default: space.s10, [narrow]: "18px" },
    paddingBottom: { default: space.s8, [narrow]: space.s6 },
    paddingLeft: { default: space.s12, [narrow]: "18px" },
    backgroundColor: color.frame,
    borderStyle: "solid",
    borderColor: color.border,
    borderTopWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderLeftWidth: { default: 1, [narrow]: 0 },
    borderTopLeftRadius: { default: radius.frame, [narrow]: 0 },
    borderBottomLeftRadius: { default: radius.frame, [narrow]: 0 },
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.s6,
  },
  heading: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: space.s2,
    minWidth: 0,
  },
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
    maxWidth: "460px",
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "21px",
    color: color.muted,
  },
  tools: { display: "flex", flex: "none", alignItems: "center", gap: space.s2 },
  close: {
    display: "inline-grid",
    placeItems: "center",
    width: "32px",
    height: "32px",
    flex: "none",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.danger },
    color: { default: color.inkSoft, ":hover": color.onAccent },
    cursor: "pointer",
    transitionProperty: "color, background-color",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.standard,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  body: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
    paddingRight: "3px",
    scrollbarWidth: "thin",
    scrollbarColor: `${color.borderStrong} transparent`,
  },
  row: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: "18px",
    paddingInline: "2px",
    paddingBlock: space.s5,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
    borderBottomWidth: { default: 1, ":last-of-type": 0 },
  },
  rowIcon: {
    display: "grid",
    placeItems: "center",
    width: "36px",
    height: "36px",
    flex: "none",
    borderRadius: "11px",
    backgroundColor: color.raised,
    color: color.ink,
  },
  rowText: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: space.s1,
    minWidth: 0,
  },
  rowTitle: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.lg,
    lineHeight: "20px",
    fontWeight: 600,
    color: color.ink,
  },
  rowDescription: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "19px",
    color: color.muted,
  },
  empty: {
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    minHeight: "260px",
    paddingInline: space.s6,
    paddingBlock: space.s10,
    borderRadius: radius.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    textAlign: "center",
  },
  emptyIcon: {
    display: "grid",
    placeItems: "center",
    width: "42px",
    height: "42px",
    marginBottom: "14px",
    borderRadius: radius.round,
    backgroundColor: color.raised,
    color: color.muted,
  },
  emptyTitle: {
    margin: 0,
    fontFamily: font.display,
    fontSize: "17px",
    lineHeight: "22px",
    fontWeight: 600,
    color: color.ink,
  },
  emptyText: {
    marginTop: space.s2,
    marginBottom: 0,
    maxWidth: "32ch",
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "19px",
    color: color.muted,
  },
  square: {
    height: "32px",
    paddingInline: space.s3,
    borderRadius: radius.control,
    borderColor: { default: color.glassEdge, ":hover": color.borderStrong },
    backgroundColor: {
      default: color.surface,
      ":hover": color.hover,
      ":active": color.raised,
    },
    boxShadow: `inset 0 1px 0 ${color.glassEdge}`,
    fontFamily: font.mono,
    fontSize: text.sm,
    fontWeight: 500,
    flexShrink: 0,
  },
  textAction: {
    height: "auto",
    paddingInline: 0,
    borderWidth: 0,
    borderRadius: 0,
    fontFamily: font.body,
    fontSize: text.md,
    fontWeight: 400,
    textDecoration: "underline",
    textUnderlineOffset: "4px",
    backgroundColor: { default: "transparent", ":hover": "transparent" },
    color: { default: color.inkSoft, ":hover": color.inkStrong },
  },
});
