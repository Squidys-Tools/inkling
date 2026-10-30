import { useEffect, useLayoutEffect, useRef } from "react";
import type { AddMode } from "./AddMenu";

export function useAddMenu({
  open,
  mode,
  onClose,
  onPickFile,
  firstOption,
}: {
  open: boolean;
  mode: AddMode | null;
  onClose: () => void;
  onPickFile: (files: File[]) => void;
  firstOption: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const focusTriggerRef = useRef(false);

  // Closing from inside the menu (Escape, the close button) hands focus back
  // to Add once it is back; an outside click leaves focus where it landed.
  useLayoutEffect(() => {
    if (open) return;
    if (focusTriggerRef.current && triggerRef.current) {
      triggerRef.current.focus({ preventScroll: true });
      focusTriggerRef.current = false;
    }
  }, [open]);

  // Opening, or stepping back from a form, puts focus on the first option. A
  // form focuses its own first field.
  useLayoutEffect(() => {
    if (!open || mode) return;
    rootRef.current?.querySelector<HTMLElement>(firstOption)?.focus({ preventScroll: true });
  }, [open, mode, firstOption]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (rootRef.current?.contains(event.target) || triggerRef.current?.contains(event.target))
      )
        return;
      onClose();
    };
    window.addEventListener("pointerdown", dismiss, true);
    return () => window.removeEventListener("pointerdown", dismiss, true);
  }, [open, onClose]);

  const pickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) onPickFile(files);
  };

  return { rootRef, triggerRef, fileRef, focusTriggerRef, pickFiles };
}
