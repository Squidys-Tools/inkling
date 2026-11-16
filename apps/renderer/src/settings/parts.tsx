import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { type ComponentProps, type ReactNode, useId } from "react";

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
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.25} />
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

/** Stands in for a section that needs the desktop app. */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconSvgElement;
  title: string;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.empty)}>
      <div aria-hidden="true" {...stylex.props(styles.emptyIcon)}>
        <HugeiconsIcon icon={icon} size={19} />
      </div>
      <h3 {...stylex.props(styles.emptyTitle)}>{title}</h3>
      <p {...stylex.props(styles.emptyText)}>{children}</p>
    </div>
  );
}

/** A labeled group of settings on one card, like the details panel's Spaces & tags. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} {...stylex.props(styles.section)}>
      <h3 id={id} {...stylex.props(styles.sectionLabel)}>
        {label}
      </h3>
      <Card>{children}</Card>
    </section>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.card)}>{children}</div>;
}

/** One setting on a Section's card: its name and what it does, then its control. */
export function CardRow({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.cardRow)}>
      <div {...stylex.props(styles.rowText)}>
        <h4 {...stylex.props(styles.cardRowTitle)}>{title}</h4>
        {description && <p {...stylex.props(styles.cardRowDescription)}>{description}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}

type ActionButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "style" | "icon"> & {
  icon?: IconSvgElement;
  look?: "plain" | "primary" | "danger";
};

/** A card row's button: sans words after a muted icon. Primary marks the one step to take next. */
export function ActionButton({ icon, look = "plain", ...props }: ActionButtonProps) {
  return (
    <Button
      variant={look === "primary" ? "primary" : "outline"}
      {...props}
      icon={
        icon && (
          <span
            aria-hidden="true"
            {...stylex.props(
              styles.actionIcon,
              look === "danger" && styles.actionIconDanger,
              look === "primary" && styles.actionIconPrimary,
            )}
          >
            <HugeiconsIcon icon={icon} size={14} />
          </span>
        )
      }
      style={[styles.action, look !== "plain" && actionLooks[look]]}
    />
  );
}

/** A hero diagram on a card: where things come from, the line they travel, and inkling. */
export function Flow({ children }: { children: ReactNode }) {
  return <div {...stylex.props(flow.row)}>{children}</div>;
}

export function FlowNode({
  icon,
  title,
  detail,
  mono,
  strong,
}: {
  icon: IconSvgElement;
  title: string;
  detail: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div {...stylex.props(flow.node)}>
      <span aria-hidden="true" {...stylex.props(flow.icon, strong && flow.iconStrong)}>
        <HugeiconsIcon icon={icon} size={26} />
      </span>
      <span {...stylex.props(flow.title)}>{title}</span>
      <span title={detail} {...stylex.props(flow.detail, mono && flow.detailMono)}>
        {detail}
      </span>
    </div>
  );
}

export function FlowLink({ tone, label }: { tone: keyof typeof flowTones; label: string }) {
  return (
    <div {...stylex.props(flow.link, flowTones[tone])}>
      <span role="status" {...stylex.props(flow.linkLabel, flowLabels[tone])}>
        {label}
      </span>
    </div>
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

const actionLooks = stylex.create({
  primary: { borderColor: color.accent },
  danger: {
    color: color.danger,
    backgroundColor: { default: color.raised, ":hover": color.dangerSoft },
  },
});

const flowTones = stylex.create({
  muted: {
    backgroundImage: `repeating-linear-gradient(90deg, ${color.borderStrong} 0 6px, transparent 6px 11px)`,
  },
  success: {
    backgroundImage: `repeating-linear-gradient(90deg, ${color.success} 0 6px, transparent 6px 11px)`,
  },
  danger: {
    backgroundImage: `repeating-linear-gradient(90deg, ${color.danger} 0 6px, transparent 6px 11px)`,
    opacity: 0.6,
  },
  accent: {
    backgroundImage: `repeating-linear-gradient(90deg, ${color.accent} 0 6px, transparent 6px 11px)`,
  },
});

const flowLabels = stylex.create({
  muted: { color: color.muted },
  success: { color: color.success },
  danger: { color: color.danger },
  accent: { color: color.accentStrong },
});

const flow = stylex.create({
  row: {
    display: "flex",
    alignItems: "flex-start",
    paddingInline: "28px",
    paddingBlock: "26px",
  },
  node: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flexShrink: 0,
    width: "160px",
    minWidth: 0,
    textAlign: "center",
  },
  icon: {
    display: "grid",
    placeItems: "center",
    width: "56px",
    height: "56px",
    marginBottom: space.s2,
    borderRadius: radius.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    backgroundColor: color.raised,
    color: color.inkSoft,
  },
  iconStrong: { color: color.ink },
  title: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.body,
    fontSize: "12.5px",
    lineHeight: "17px",
    fontWeight: 500,
    color: color.ink,
  },
  detail: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.body,
    fontSize: "11.5px",
    lineHeight: "16px",
    color: color.muted,
  },
  detailMono: { fontFamily: font.mono },
  link: {
    position: "relative",
    flex: "1 1 auto",
    minWidth: "60px",
    height: "2px",
    // Level with the middle of the 56px node icons.
    marginTop: "27px",
  },
  linkLabel: {
    position: "absolute",
    left: "50%",
    top: "-22px",
    transform: "translateX(-50%)",
    paddingInline: "6px",
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "14px",
    fontWeight: 500,
    whiteSpace: "nowrap",
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
  // A Section's card is already the surface color, so a capsule on it sinks below it instead.
  onCard: { borderColor: color.border, backgroundColor: color.sunken },
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
  section: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    marginTop: { default: "26px", ":first-child": 0 },
  },
  sectionLabel: {
    marginTop: 0,
    marginBottom: space.s2,
    marginInline: "2px",
    fontFamily: font.body,
    fontSize: text.xs,
    lineHeight: "14px",
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: color.muted,
  },
  card: {
    display: "flex",
    flexShrink: 0,
    flexDirection: "column",
    borderRadius: radius.tile,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  cardRow: {
    display: "flex",
    alignItems: "center",
    gap: space.s4,
    minHeight: "62px",
    paddingInline: space.s4,
    paddingBlock: "14px",
    borderTopStyle: "solid",
    borderTopColor: color.border,
    borderTopWidth: { default: 1, ":first-child": 0 },
  },
  cardRowTitle: {
    margin: 0,
    fontFamily: font.body,
    fontSize: "13.5px",
    lineHeight: "18px",
    fontWeight: 500,
    color: color.ink,
  },
  cardRowDescription: {
    margin: 0,
    fontFamily: font.body,
    fontSize: "12.5px",
    lineHeight: "17px",
    color: color.muted,
  },
  action: {
    flexShrink: 0,
    gap: "6px",
    height: "30px",
    paddingInline: space.s3,
    borderColor: color.borderStrong,
    backgroundColor: { default: color.raised, ":hover": color.hover },
    fontSize: "12.5px",
  },
  actionIcon: { display: "inline-flex", color: color.muted },
  actionIconDanger: { color: color.danger },
  actionIconPrimary: { color: color.onAccent },
  rowText: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: space.s1,
    minWidth: 0,
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
