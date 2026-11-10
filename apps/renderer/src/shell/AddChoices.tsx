import { Menu } from "@base-ui/react/menu";
import Bookmark01Icon from "@hugeicons/core-free-icons/Bookmark01Icon";
import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon";
import FileTextIcon from "@hugeicons/core-free-icons/FileTextIcon";
import Image01Icon from "@hugeicons/core-free-icons/Image01Icon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";

export type Choice = {
  id: "note" | "link" | "quote" | "file" | "screen";
  label: string;
  icon: IconSvgElement;
};

const choices: Choice[] = [
  { id: "note", label: "Note", icon: FileTextIcon },
  { id: "link", label: "Link", icon: Link01Icon },
  { id: "quote", label: "Quote", icon: Bookmark01Icon },
  { id: "file", label: "File", icon: Image01Icon },
  { id: "screen", label: "Screen", icon: Camera01Icon },
];

/** The Add button with its menu. AddMenu shows the same button alone until this has loaded. */
export function AddChoices({
  trigger,
  children,
  onChoose,
}: {
  trigger: ComponentProps<"button">;
  children: ReactNode;
  onChoose: (id: Choice["id"]) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger {...trigger}>{children}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="top"
          align="center"
          sideOffset={6}
          {...stylex.props(styles.positioner)}
        >
          <Menu.Popup aria-label="Add to your library" {...stylex.props(styles.popup)}>
            <div {...stylex.props(styles.title)}>Add</div>
            <div {...stylex.props(styles.grid)}>
              {choices.map((choice) => (
                <Menu.Item
                  key={choice.id}
                  onClick={() => onChoose(choice.id)}
                  aria-label={choice.id === "screen" ? "Screenshot" : undefined}
                  className={(state) =>
                    stylex.props(styles.tile, state.highlighted && styles.tileHighlighted)
                      .className ?? ""
                  }
                >
                  <HugeiconsIcon icon={choice.icon} size={22} strokeWidth={1.5} />
                  <span {...stylex.props(styles.tileLabel)}>{choice.label}</span>
                </Menu.Item>
              ))}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const open = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(12px) scale(0.94)" },
  to: { opacity: 1, transform: "none" },
});

const styles = stylex.create({
  positioner: { width: "max(220px, var(--anchor-width))", zIndex: 40, outline: "none" },
  popup: {
    boxSizing: "border-box",
    padding: "4px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: "18px",
    backgroundColor: color.raised,
    boxShadow: `0 18px 44px ${color.shadow}`,
    transformOrigin: "bottom center",
    animationName: open,
    animationDuration: motion.micro,
    animationTimingFunction: motion.enter,
    outline: "none",
  },
  title: {
    display: "flex",
    alignItems: "center",
    height: "40px",
    paddingInline: "12px",
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "18px",
    fontWeight: 600,
    color: color.inkSoft,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "2px",
    padding: "6px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: radius.panel,
    backgroundColor: color.frame,
  },
  tile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    minWidth: 0,
    paddingTop: "12px",
    paddingInline: "2px",
    paddingBottom: "10px",
    borderRadius: radius.tile,
    color: color.muted,
    cursor: "pointer",
    outline: "none",
    userSelect: "none",
    transitionProperty: "background-color, color",
    transitionDuration: motion.micro,
  },
  tileHighlighted: { backgroundColor: color.overlayActive, color: color.ink },
  tileLabel: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.body,
    fontSize: "12px",
    lineHeight: "15px",
    fontWeight: 500,
    color: color.inkSoft,
  },
});
