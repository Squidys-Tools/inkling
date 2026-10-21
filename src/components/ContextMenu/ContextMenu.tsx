import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ContextMenu.css";

export type ContextMenuEntry = { label: string; icon: IconSvgElement; onSelect: () => void };

type Props = {
  x: number;
  y: number;
  label: string;
  entries: ContextMenuEntry[];
  // Gets focus back when the menu is dismissed from the keyboard.
  returnFocus?: HTMLElement | null;
  onClose: () => void;
};

const EDGE = 8;

export function ContextMenu({ x, y, label, entries, returnFocus, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Opens toward the pointer's bottom right, flipping on whichever axis would
  // run off the window.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: x + width > window.innerWidth - EDGE ? Math.max(EDGE, x - width) : x,
      top: y + height > window.innerHeight - EDGE ? Math.max(EDGE, y - height) : y,
    });
    menu.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("wheel", dismiss, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("wheel", dismiss, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") focusAt(index + 1);
    else if (event.key === "ArrowUp") focusAt(index - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(-1);
    else if (event.key === "Escape" || event.key === "Tab") {
      onClose();
      returnFocus?.focus({ preventScroll: true });
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={label}
      style={position}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry) => (
        <button
          key={entry.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="context-menu-item"
          onClick={() => {
            onClose();
            entry.onSelect();
          }}
        >
          <HugeiconsIcon icon={entry.icon} size={15} />
          {entry.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
