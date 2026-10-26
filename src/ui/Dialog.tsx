import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode, RefObject } from "react";
import { cx } from "./cx";

const EASE = "duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";
// The viewport fades with the backdrop so the popup's opacity compounds with
// it, as when the popup sat inside the backdrop.
const FADE = cx(
  "transition-opacity",
  EASE,
  "data-starting-style:opacity-0 data-ending-style:opacity-0",
);

export function Dialog({
  open,
  onOpenChange,
  initialFocus,
  className,
  children,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={cx("fixed inset-0 z-110 bg-[rgba(10,10,9,0.72)]", FADE)} />
        <BaseDialog.Viewport
          className={cx("fixed inset-0 z-110 grid place-items-center p-6", FADE)}
        >
          <BaseDialog.Popup
            initialFocus={initialFocus}
            className={cx(
              "[transition-property:opacity,transform]",
              EASE,
              "data-starting-style:opacity-0 data-starting-style:[transform:translateY(8px)_scale(0.98)] data-ending-style:opacity-0 data-ending-style:[transform:translateY(8px)_scale(0.98)]",
              className,
            )}
            {...props}
          >
            {children}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export const DialogTitle = BaseDialog.Title;
export const DialogDescription = BaseDialog.Description;
export const DialogClose = BaseDialog.Close;
