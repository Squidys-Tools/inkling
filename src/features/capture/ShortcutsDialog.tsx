import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useRef } from "react";
import { Dialog, DialogClose, DialogDescription, DialogTitle } from "../../ui/Dialog";

const SHORTCUTS: { id: string; keys: ReactNode; action: string }[] = [
  { id: "slash", keys: <kbd>/</kbd>, action: "Focus search" },
  {
    id: "mod-k",
    keys: (
      <>
        <kbd>Ctrl</kbd> or <kbd>⌘</kbd> + <kbd>K</kbd>
      </>
    ),
    action: "Focus search",
  },
  { id: "n", keys: <kbd>N</kbd>, action: "Start a new note" },
  {
    id: "mod-backslash",
    keys: (
      <>
        <kbd>Ctrl</kbd> or <kbd>⌘</kbd> + <kbd>\</kbd>
      </>
    ),
    action: "Show or hide the sidebar",
  },
  { id: "help", keys: <kbd>?</kbd>, action: "Show keyboard shortcuts" },
  { id: "esc", keys: <kbd>Esc</kbd>, action: "Close a panel or return to capture options" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      initialFocus={closeRef}
      id="shortcuts-modal"
      className="w-[min(420px,100%)] rounded-sidebar border border-[#4a4842] bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
    >
      <header className="flex items-start justify-between gap-3.5 border-b border-border pb-3.5">
        <div>
          <DialogTitle className="m-0 font-body text-[20px]/[1.15] font-medium tracking-[-0.03em] text-ink">
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="mt-1 mb-0 text-[12px] text-muted">
            Use these when you’re not typing in a field.
          </DialogDescription>
        </div>
        <DialogClose
          ref={closeRef}
          className="icon-button small"
          aria-label="Close keyboard shortcuts"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </DialogClose>
      </header>
      <dl className="mt-component mb-0 grid gap-3 [&_kbd]:min-w-[23px] [&_kbd]:rounded-[5px] [&_kbd]:border [&_kbd]:border-[#3e3a36] [&_kbd]:bg-canvas [&_kbd]:px-1.5 [&_kbd]:py-1 [&_kbd]:text-center [&_kbd]:font-body [&_kbd]:text-[10px] [&_kbd]:leading-[normal] [&_kbd]:text-ink">
        {SHORTCUTS.map(({ id, keys, action }) => (
          <div key={id} className="grid grid-cols-[minmax(150px,1fr)_1fr] items-center gap-3">
            <dt className="flex items-center gap-[5px] text-[11px] text-muted">{keys}</dt>
            <dd className="m-0 text-[12px] text-ink">{action}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
