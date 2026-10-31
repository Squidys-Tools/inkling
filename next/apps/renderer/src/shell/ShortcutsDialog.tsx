import { Dialog } from "@base-ui/react/dialog";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type Command, bindingLabel, bindingsFor, shortcuts } from "@inkling/contracts/shortcuts";
import { Kbd } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { platform } from "../desktop.ts";
import { handleCommand } from "./commands.ts";

const commands = Object.keys(shortcuts) as Command[];

/** Every shortcut, read from the same table the key handler and the macOS menu use. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => handleCommand("showShortcuts", () => setOpen(true)), []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Popup {...stylex.props(styles.popup)}>
          <header {...stylex.props(styles.header)}>
            <div>
              <Dialog.Title {...stylex.props(styles.title)}>Keyboard shortcuts</Dialog.Title>
              <Dialog.Description {...stylex.props(styles.description)}>
                Single keys work when you’re not typing in a field.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close keyboard shortcuts" {...stylex.props(styles.close)}>
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </Dialog.Close>
          </header>
          <dl {...stylex.props(styles.list)}>
            {commands.map((command) => (
              <div key={command} {...stylex.props(styles.row)}>
                <dt {...stylex.props(styles.action)}>{shortcuts[command].label}</dt>
                <dd {...stylex.props(styles.keys)}>
                  {bindingsFor(command, platform).map((binding, index) => (
                    <span key={bindingLabel(binding, platform)} {...stylex.props(styles.binding)}>
                      {index > 0 && <span {...stylex.props(styles.or)}>or</span>}
                      <Kbd>{bindingLabel(binding, platform)}</Kbd>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const appear = stylex.keyframes({
  from: { opacity: 0, transform: "translate(-50%, -48%) scale(0.98)" },
  to: { opacity: 1, transform: "translate(-50%, -50%)" },
});

const styles = stylex.create({
  backdrop: { position: "fixed", inset: 0, zIndex: 60, backgroundColor: color.scrim },
  popup: {
    position: "fixed",
    top: "50%",
    left: "50%",
    zIndex: 61,
    boxSizing: "border-box",
    width: "min(440px, calc(100vw - 32px))",
    padding: "20px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: cardColor.controlEdge,
    borderRadius: radius.panel,
    backgroundColor: color.surface,
    boxShadow: `0 24px 70px ${color.shadow}`,
    transform: "translate(-50%, -50%)",
    animationName: appear,
    animationDuration: motion.micro,
    animationTimingFunction: motion.enter,
    outline: "none",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "14px",
    paddingBottom: "14px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
  },
  title: {
    margin: 0,
    fontFamily: font.body,
    fontSize: "20px",
    lineHeight: 1.15,
    fontWeight: 500,
    letterSpacing: "-0.03em",
    color: color.ink,
  },
  description: { marginTop: "4px", marginBottom: 0, fontSize: "12px", color: color.muted },
  close: {
    display: "grid",
    placeItems: "center",
    width: "30px",
    height: "30px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.overlayActive },
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  list: { display: "grid", gap: "10px", marginTop: "16px", marginBottom: 0 },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "12px",
  },
  action: { fontSize: "12px", color: color.ink },
  keys: { display: "flex", alignItems: "center", gap: "6px", margin: 0 },
  binding: { display: "inline-flex", alignItems: "center", gap: "6px" },
  or: { fontSize: "11px", color: color.muted },
});
