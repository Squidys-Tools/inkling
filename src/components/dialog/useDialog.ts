import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  dialogRootProps,
  focusableWithin,
  handleEscape,
  registerDialog,
} from "./dialog";
import type { DialogRootProps } from "./dialog";

export type UseDialogOptions = {
  open: boolean;
  /** What Escape does. May deliberately do nothing, as the capture modal does
   *  while a save is in flight. */
  onClose: () => void;
  /** Accessible name, for a dialog with no visible heading to point at. */
  label?: string;
  /** Where focus goes when the dialog opens. Defaults to the first focusable
   *  inside it. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** False for a dialog that deliberately leaves its surroundings usable. The
   *  item overlay is modeless by design, so it traps nothing, claims no
   *  modality, and takes no focus on open — it waits for its own settle. */
  trapFocus?: boolean;
  /** False when the caller restores focus itself, which the item overlay does
   *  because its source card may have been re-rendered by the grid. */
  restoreFocus?: boolean;
  /** An element ref the caller already owns, for a surface whose panel an
   *  animation library also drives. The item overlay's GSAP timelines write
   *  `left/top/width/height` on the same node, so there is one node and one ref
   *  rather than a second one bridged across. */
  elementRef?: RefObject<HTMLElement | null>;
};

export type DialogBinding<TElement extends HTMLElement = HTMLElement> = {
  /** Put on the element carrying the dialog role. `RefObject` is invariant, so
   *  the element type is carried through rather than widened at every call
   *  site: `useDialog<HTMLDivElement>` against a `div`, `HTMLDivElement` against
   *  a `section`. */
  dialogRef: RefObject<TElement | null>;
  rootProps: DialogRootProps;
  /** Spread onto the visible heading so the name resolves to real text. */
  labelProps: { id: string };
};

/**
 * Owns the dialog behaviour shared by every modal and modeless surface in the
 * app: one Escape press closes one dialog, focus goes in and comes back, Tab
 * stays inside. See `dialog.ts` for why the surfaces are not otherwise alike.
 */
export function useDialog<TElement extends HTMLElement = HTMLElement>(
  options: UseDialogOptions,
): DialogBinding<TElement> {
  const {
    open,
    onClose,
    label,
    initialFocus,
    trapFocus = true,
    restoreFocus = true,
    elementRef,
  } = options;

  const labelId = useId();
  const ownRef = useRef<TElement | null>(null);
  const dialogRef = (elementRef ?? ownRef) as RefObject<TElement | null>;

  // Listeners are installed once per open, so they read the current options
  // through a ref rather than re-subscribing on every render.
  const latest = useRef({ onClose, initialFocus, trapFocus });
  useLayoutEffect(() => {
    latest.current = { onClose, initialFocus, trapFocus };
  });

  useEffect(() => {
    if (!open) return;

    const entry = { onEscape: () => latest.current.onClose() };
    const release = registerDialog(entry);

    // Capture phase, so the topmost dialog answers Escape before anything
    // listening further down the tree can act on the same press.
    const onKeyDown = (event: KeyboardEvent) => {
      // A focused plain input (the new-tag field, or the editor's link-URL
      // editor) owns its own Escape; the topmost dialog must not claim it.
      if (event.key === "Escape" && event.target instanceof HTMLInputElement) return;
      handleEscape(entry, event);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      release();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !trapFocus) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const active = document.activeElement;
      const insideDialog = active instanceof Node && dialog.contains(active);
      const inIframe = active instanceof HTMLIFrameElement;

      // Focus in an embedded document cannot be seen from here, so Tab from
      // there comes back to the dialog rather than walking out of it.
      if (!insideDialog || inIframe) {
        event.preventDefault();
        const focusable = focusableWithin(dialog);
        (focusable[0] ?? dialog).focus({ preventScroll: true });
        return;
      }

      const focusable = focusableWithin(dialog);
      // The capture modal's keyed form is gone for the length of its exit
      // animation, so an empty dialog is a real state rather than a bug.
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, trapFocus]);

  const placesFocus = trapFocus || initialFocus !== undefined;

  useEffect(() => {
    if (!open || !placesFocus) return;

    const previous = restoreFocus && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const timer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      // A field that focused itself on mount keeps it: the capture modal's
      // mode-specific input, which re-claims focus on every mode switch.
      const active = document.activeElement;
      if (active instanceof HTMLElement && dialog.contains(active)) return;
      const target = latest.current.initialFocus?.current
        ?? focusableWithin(dialog)[0]
        ?? dialog;
      target.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      // The opener may have left the DOM — a virtualized card scrolled out, or
      // a dialog that closed the surface that opened it.
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, placesFocus, restoreFocus]);

  return {
    dialogRef,
    rootProps: dialogRootProps({ labelId, label, modal: trapFocus }),
    labelProps: { id: labelId },
  };
}