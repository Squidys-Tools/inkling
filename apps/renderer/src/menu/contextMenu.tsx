import { Menu } from "@base-ui/react/menu";
import ArchiveIcon from "@inkling/ui/icons/Archive";
import ChevronRightIcon from "@inkling/ui/icons/ChevronRight";
import ArrowUpRightIcon from "@inkling/ui/icons/ArrowUpRight";
import BookmarkIcon from "@inkling/ui/icons/Bookmark";
import CopyIcon from "@inkling/ui/icons/Copy";
import TrashIcon from "@inkling/ui/icons/Trash";
import FileTextIcon from "@inkling/ui/icons/FileText";
import FolderIcon from "@inkling/ui/icons/Folder";
import ImageIcon from "@inkling/ui/icons/Image";
import LinkIcon from "@inkling/ui/icons/Link";
import { Icon } from "@inkling/ui";
import type { ContextMenuItem } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useEffect, useMemo, useRef } from "react";
import { createAtom, useSelector } from "@tanstack/react-store";
import { presentMenu, type MenuAction } from "./presentation.ts";

type Open = {
  items: ContextMenuItem[];
  x: number;
  y: number;
  returnFocus: HTMLElement | null;
  resolve: (id: string | null) => void;
};

const openMenu = createAtom<Open | null>(null);

/** Native and preview share presentation; callers retain their real action APIs. */
export function showContextMenu(items: ContextMenuItem[], at: { x: number; y: number }) {
  openMenu.get()?.resolve(null);
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return new Promise<string | null>((resolve) =>
    openMenu.set({ items, ...at, returnFocus, resolve }),
  );
}

function close(menu: Open, id: string | null) {
  // A replaced menu's delayed dismissal must not settle the newer menu.
  if (openMenu.get() !== menu) return;
  openMenu.set(null);
  menu.resolve(id);
}

export function menuPoint(event: { clientX?: number; clientY?: number; currentTarget: Element }) {
  if (event.clientX || event.clientY) return { x: event.clientX ?? 0, y: event.clientY ?? 0 };
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + 16, y: rect.top + 16 };
}

export function ContextMenuLayer() {
  const menu = useSelector(openMenu);
  return menu ? <OpenContextMenu menu={menu} /> : null;
}

function actionIcon(id: string) {
  if (/^(space:|allow:)|^remove-here$/.test(id)) return BookmarkIcon;
  switch (id) {
    case "archive":
    case "restore":
      return ArchiveIcon;
    case "delete":
      return TrashIcon;
    case "folder":
      return FolderIcon;
    case "copy-image":
      return ImageIcon;
    case "copy":
      return CopyIcon;
    case "original":
      return LinkIcon;
    case "open":
      return ArrowUpRightIcon;
    default:
      return FileTextIcon;
  }
}

function Action({ item, menu }: { item: MenuAction; menu: Open }) {
  return (
    <Menu.Item
      disabled={item.enabled === false}
      onClick={() => close(menu, item.id)}
      className={(state) =>
        stylex.props(
          styles.item,
          item.destructive && styles.destructive,
          state.highlighted && styles.highlighted,
          state.disabled && styles.disabled,
        ).className ?? ""
      }
    >
      <Icon icon={actionIcon(item.id)} size={15} />
      <span {...stylex.props(styles.label)}>{item.label}</span>
    </Menu.Item>
  );
}

function OpenContextMenu({ menu }: { menu: Open }) {
  const keyboardClose = useRef(false);
  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () => DOMRect.fromRect({ x: menu.x, y: menu.y, width: 0, height: 0 }),
    }),
    [menu.x, menu.y],
  );
  useEffect(() => {
    const dismiss = () => close(menu, null);
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-inkling-context-popup]"))
        return;
      dismiss();
    };
    window.addEventListener("wheel", wheel, { capture: true, passive: true });
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("wheel", wheel, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [menu]);
  return (
    <Menu.Root
      open
      modal={false}
      onOpenChange={(open, details) => {
        const event = details.event;
        // The release of the right button that opened this menu is not an outside dismissal.
        if (details.reason === "outside-press" && "button" in event && event.button === 2) return;
        if (!open) {
          keyboardClose.current = details.reason === "escape-key";
          close(menu, null);
        }
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={anchor}
          positionMethod="fixed"
          side="bottom"
          align="start"
          sideOffset={2}
          collisionPadding={8}
          collisionAvoidance={{ side: "flip", align: "flip", fallbackAxisSide: "none" }}
          {...stylex.props(styles.positioner)}
        >
          <Menu.Popup
            aria-label="Item actions"
            data-inkling-context-popup=""
            finalFocus={() =>
              keyboardClose.current && menu.returnFocus?.isConnected ? menu.returnFocus : false
            }
            onFocus={(event) => {
              if (event.target === event.currentTarget)
                event.currentTarget
                  .querySelector<HTMLElement>(
                    '[role="menuitem"]:not([aria-disabled="true"]):not([data-disabled])',
                  )
                  ?.focus({ preventScroll: true });
            }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              event.preventDefault();
              close(menu, null);
              if (menu.returnFocus?.isConnected) menu.returnFocus.focus({ preventScroll: true });
            }}
            {...stylex.props(styles.popup)}
          >
            {presentMenu(menu.items).map((item, index) =>
              item.type === "separator" ? (
                // oxlint-disable-next-line react/no-array-index-key -- separators have no identity and the list never reorders while open.
                <Menu.Separator key={`separator-${index}`} {...stylex.props(styles.separator)} />
              ) : item.type === "spaces" ? (
                <Menu.SubmenuRoot key="spaces">
                  <Menu.SubmenuTrigger
                    className={(state) =>
                      stylex.props(
                        styles.item,
                        (state.highlighted || state.open) && styles.highlighted,
                      ).className ?? ""
                    }
                  >
                    <Icon icon={BookmarkIcon} size={15} />
                    <span {...stylex.props(styles.label)}>Keep in a Space</span>
                    <Icon icon={ChevronRightIcon} size={13} />
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner
                      sideOffset={4}
                      align="start"
                      collisionPadding={8}
                      {...stylex.props(styles.positioner)}
                    >
                      <Menu.Popup
                        aria-label="Space actions"
                        data-inkling-context-popup=""
                        onContextMenu={(event) => event.preventDefault()}
                        {...stylex.props(styles.popup)}
                      >
                        {item.items.map((action) => (
                          <Action key={action.id} item={action} menu={menu} />
                        ))}
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>
              ) : (
                <Action key={item.id} item={item} menu={menu} />
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const enter = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0.97)" },
  to: { opacity: 1, transform: "scale(1)" },
});
const styles = stylex.create({
  positioner: { zIndex: 1000, outline: "none" },
  popup: {
    boxSizing: "border-box",
    minWidth: "min(200px, calc(100vw - 16px))",
    maxWidth: "min(280px, calc(100vw - 16px))",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: "5px",
    borderRadius: radius.tile,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.glassEdge,
    backgroundColor: color.glass,
    backdropFilter: "blur(20px) saturate(1.4)",
    boxShadow: `0 12px 32px ${color.shadow}`,
    transformOrigin: "var(--transform-origin)",
    animationName: { default: enter, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "120ms",
    animationTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
    outline: "none",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    height: "32px",
    paddingInline: "8px",
    borderRadius: "8px",
    fontFamily: font.body,
    fontSize: text.md,
    color: color.inkSoft,
    cursor: "pointer",
    outline: "none",
    userSelect: "none",
  },
  label: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  highlighted: { backgroundColor: color.overlayActive, color: color.inkStrong },
  destructive: { color: color.danger },
  disabled: { opacity: 0.35, cursor: "default" },
  separator: {
    height: "1px",
    marginBlock: space.s1,
    marginInline: space.s2,
    backgroundColor: color.border,
  },
});
