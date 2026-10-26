import { Menu } from "@base-ui/react/menu";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type RefObject, useEffect, useMemo, useRef } from "react";

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
  const openedRef = useRef(false);
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
            onFocus={(event) => {
              // A pointer open lands Base UI's focus on the popup after mount; the
              // first item takes it instead, so it opens highlighted.
              if (openedRef.current || event.target !== event.currentTarget) return;
              openedRef.current = true;
              event.currentTarget
                .querySelector<HTMLElement>("[role=menuitem]")
                ?.focus({ preventScroll: true });
            }}
            className="glass min-w-[200px] max-w-[280px] rounded-[12px] p-[5px] outline-none transition-[opacity,transform] duration-120 ease-[cubic-bezier(0.23,1,0.32,1)] data-starting-style:opacity-0 data-starting-style:[transform:scale(0.97)] motion-reduce:transition-none"
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
                className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-[8px] py-0 pr-2.5 pl-2 text-left font-body text-[13px] leading-[normal] whitespace-nowrap text-ink-soft outline-none data-highlighted:bg-glass-active data-highlighted:text-ink [&_svg]:flex-none [&_svg]:text-muted data-highlighted:[&_svg]:text-ink"
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
