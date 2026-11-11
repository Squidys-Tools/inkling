import { Menu } from "@base-ui/react/menu";
import Archive03Icon from "@hugeicons/core-free-icons/Archive03Icon";
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import ArrowUp01Icon from "@hugeicons/core-free-icons/ArrowUp01Icon";
import ArrowUpRight01Icon from "@hugeicons/core-free-icons/ArrowUpRight01Icon";
import Bookmark01Icon from "@hugeicons/core-free-icons/Bookmark01Icon";
import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import Edit01Icon from "@hugeicons/core-free-icons/Edit01Icon";
import FileTextIcon from "@hugeicons/core-free-icons/FileTextIcon";
import Folder01Icon from "@hugeicons/core-free-icons/Folder01Icon";
import Image01Icon from "@hugeicons/core-free-icons/Image01Icon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import PaintBoardIcon from "@hugeicons/core-free-icons/PaintBoardIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useEffect, useMemo, useRef } from "react";
import { closeContextMenu as close, type OpenMenu as Open } from "./contextMenu.tsx";
import { presentMenu, type MenuAction } from "./presentation.ts";

function actionIcon(id: string) {
  if (/^(space:|allow:)|^remove-here$/.test(id)) return Bookmark01Icon;
  switch (id) {
    case "archive":
    case "restore":
      return Archive03Icon;
    case "delete":
      return Delete02Icon;
    case "folder":
      return Folder01Icon;
    case "copy-image":
      return Image01Icon;
    case "copy":
      return Copy01Icon;
    case "original":
      return Link01Icon;
    case "open":
      return ArrowUpRight01Icon;
    case "rename":
      return Edit01Icon;
    case "color":
      return PaintBoardIcon;
    case "up":
      return ArrowUp01Icon;
    case "down":
      return ArrowDown01Icon;
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
      <HugeiconsIcon icon={actionIcon(item.id)} size={15} />
      <span {...stylex.props(styles.label)}>{item.label}</span>
    </Menu.Item>
  );
}

export function OpenContextMenu({ menu }: { menu: Open }) {
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
            aria-label={menu.label}
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
                    <HugeiconsIcon icon={Bookmark01Icon} size={15} />
                    <span {...stylex.props(styles.label)}>Keep in a Space</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} size={13} />
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
