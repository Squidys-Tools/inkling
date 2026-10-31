import { Menu } from "@base-ui/react/menu";
import {
  Bookmark01Icon,
  Camera01Icon,
  FileTextIcon,
  Image01Icon,
  Link01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { captureFiles, captureScreenshot, useCaptureState } from "../capture/capture.ts";
import { handleCommand } from "./commands.ts";

type Choice = {
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

/**
 * The sidebar's Add button. Note, Link and Quote open their pages; File and
 * Screenshot save straight into the library without leaving it.
 */
export function AddMenu() {
  const navigate = useNavigate();
  const files = useRef<HTMLInputElement>(null);
  const saving = useCaptureState((state) => state.saving > 0);

  useEffect(() => handleCommand("addFile", () => files.current?.click()), []);

  const choose = (id: Choice["id"]) => {
    if (id === "file") files.current?.click();
    else if (id === "screen") void captureScreenshot();
    else void navigate({ to: `/add/${id}` });
  };

  return (
    <div {...stylex.props(styles.anchor)}>
      <input
        ref={files}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          captureFiles([...(event.currentTarget.files ?? [])]);
          event.currentTarget.value = "";
        }}
        {...stylex.props(styles.fileInput)}
      />
      <Menu.Root>
        <Menu.Trigger {...stylex.props(styles.trigger)}>
          <HugeiconsIcon icon={PlusSignIcon} size={16} />
          {saving ? "Saving…" : "Add"}
        </Menu.Trigger>
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
                    onClick={() => choose(choice.id)}
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
    </div>
  );
}

const open = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(12px) scale(0.94)" },
  to: { opacity: 1, transform: "none" },
});

const styles = stylex.create({
  anchor: { position: "relative", marginBottom: "8px" },
  fileInput: {
    position: "absolute",
    width: "1px",
    height: "1px",
    opacity: 0,
    pointerEvents: "none",
  },
  trigger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    width: "100%",
    height: "40px",
    paddingInline: "14px",
    borderWidth: 0,
    borderRadius: radius.tile,
    backgroundColor: { default: color.ink, ":hover": cardColor.addHover },
    boxShadow: `inset 0 1px 0 ${cardColor.addHighlight}, inset 0 -2px 0 ${cardColor.addLowlight}, 0 6px 18px ${cardColor.addShadow}`,
    color: color.window,
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "18px",
    fontWeight: 600,
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    transitionProperty: "background-color, transform",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
  positioner: { width: "var(--anchor-width)", zIndex: 40, outline: "none" },
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
