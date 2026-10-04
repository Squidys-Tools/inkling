/**
 * Dialog behaviour that is easy to get subtly wrong, kept free of React so it
 * can be tested directly.
 *
 * The five surfaces that use this do not share a shape. Two are centered panels,
 * the reader is a full-viewport opaque layer, and the item overlay is an
 * absolutely positioned panel anchored to a card and is deliberately modeless.
 * What they share is the part that is hard: one Escape press closes exactly one
 * dialog, focus goes in when one opens and comes back out when it closes, and
 * Tab stays inside a modal one. Anatomy, animation and z-index stay with each
 * caller.
 */

/** Elements Tab can land on inside a dialog, in DOM order. `iframe` is included
 *  because allowlisted video embeds are real reader content and a cross-origin
 *  iframe is a focus boundary the host page cannot query into. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "[contenteditable]:not([contenteditable=false])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function focusableWithin(root: ParentNode | null | undefined): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export type DialogEntry = {
  /** Runs when this dialog is the topmost one and Escape is pressed. */
  onEscape: () => void;
};

/** Open dialogs, oldest first. The last entry is the topmost. */
const openDialogs: DialogEntry[] = [];

/**
 * Puts a dialog on the stack and returns the call that takes it off again.
 *
 * The caller decides which dialog is on top by mounting order: a dialog opened
 * from inside another mounts later, so it sits above the one it came from. That
 * is how the reader lands above the item overlay that opened it, and why one
 * Escape closes the reader and leaves the overlay alone.
 *
 * Release is idempotent because React runs effect cleanups more than once in
 * development, and an unguarded splice would drop a sibling.
 */
export function registerDialog(entry: DialogEntry): () => void {
  openDialogs.push(entry);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = openDialogs.indexOf(entry);
    if (index >= 0) openDialogs.splice(index, 1);
  };
}

/** The dialog that owns Escape, or null when no dialog is open. */
export function escapeOwner(): DialogEntry | null {
  return openDialogs.length > 0 ? openDialogs[openDialogs.length - 1]! : null;
}

/** The slice of a KeyboardEvent the Escape decision reads. */
export type EscapeEvent = {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
};

/**
 * Answers Escape for `entry` if it is the dialog the user is looking at.
 * Returns whether it acted, so a caller can tell "ignored" from "handled".
 *
 * Dialogs underneath swallow nothing and close nothing. That is the whole
 * point: a listener on a shared node cannot stop a sibling listener with
 * `stopPropagation`, which is how one press used to close the reader and the
 * item overlay behind it at the same time.
 */
export function handleEscape(entry: DialogEntry, event: EscapeEvent): boolean {
  if (event.key !== "Escape") return false;
  if (escapeOwner() !== entry) return false;
  event.preventDefault();
  event.stopPropagation();
  entry.onEscape();
  return true;
}

export type DialogRootProps = {
  role: "dialog";
  "aria-modal": boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  tabIndex: -1;
};

/**
 * `aria-labelledby` is only ever emitted next to the id it points at, and
 * `aria-label` only when there is no visible heading to point at. A caller
 * therefore cannot produce a dialog whose label reference resolves to nothing,
 * which is the defect the settings modal shipped with.
 */
export function dialogRootProps(options: {
  labelId: string;
  label?: string;
  modal: boolean;
}): DialogRootProps {
  return {
    role: "dialog",
    "aria-modal": options.modal,
    ...(options.label === undefined
      ? { "aria-labelledby": options.labelId }
      : { "aria-label": options.label }),
    tabIndex: -1,
  };
}