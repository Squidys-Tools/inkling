import { Menu } from "@base-ui/react/menu";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { cx } from "../../ui/cx";
import { focusFirstMenuItem, MENU_ITEM, MENU_POPUP_MOTION } from "../../ui/Menu";

export type ContextMenuEntry = { label: string; icon: IconSvgElement; onSelect: () => void };

type Props = {
  x: number;
  y: number;
  label: string;
  entries: ContextMenuEntry[];
  // Gets focus back when the menu is dismissed from the keyboard.
  returnFocus?: HTMLElement | null;
  // A layer App hands to liquid glass, so the menu takes the library's glass.
  container: RefObject<HTMLElement | null>;
  onClose: () => void;
};

// Opens toward the pointer's bottom right, flipping on whichever axis would run
// off the window. Remount it (key) for each new pointer position.
export function ContextMenu({ x, y, label, entries, returnFocus, container, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const keyboardCloseRef = useRef(false);
  const anchor = useMemo(
    () => ({ getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) }),
    [x, y],
  );

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("wheel", dismiss, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("wheel", dismiss, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <Menu.Root
      open
      modal={false}
      onOpenChange={(open, details) => {
        if (open) return;
        keyboardCloseRef.current = details.reason === "escape-key";
        onClose();
      }}
    >
      <Menu.Portal container={container}>
        <Menu.Positioner
          anchor={anchor}
          positionMethod="fixed"
          side="bottom"
          align="start"
          collisionPadding={8}
          collisionAvoidance={{ side: "flip", align: "flip", fallbackAxisSide: "none" }}
          className="z-1000"
        >
          <Menu.Popup
            ref={popupRef}
            aria-label={label}
            finalFocus={() => (keyboardCloseRef.current ? (returnFocus ?? false) : false)}
            onFocus={focusFirstMenuItem}
            className={cx(
              "glass min-w-[200px] max-w-[280px] rounded-[12px] p-[5px]",
              MENU_POPUP_MOTION,
            )}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              event.preventDefault();
              onClose();
              returnFocus?.focus({ preventScroll: true });
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            {entries.map((entry) => (
              <Menu.Item
                key={entry.label}
                className={cx(
                  MENU_ITEM,
                  "whitespace-nowrap text-ink-soft [&_svg]:flex-none [&_svg]:text-muted data-highlighted:[&_svg]:text-ink",
                )}
                onClick={entry.onSelect}
              >
                <HugeiconsIcon icon={entry.icon} size={15} />
                {entry.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
