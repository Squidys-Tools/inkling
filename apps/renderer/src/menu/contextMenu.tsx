import { Menu } from "@base-ui/react/menu";
import type { ContextMenuItem } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { desktop } from "../desktop.ts";
import { createStore, useStore } from "../library/store.ts";

type Open = {
  items: ContextMenuItem[];
  x: number;
  y: number;
  resolve: (id: string | null) => void;
};

const openMenu = createStore<Open | null>(null);

/**
 * Shows a context menu and resolves with the chosen item's id. The desktop app
 * uses the system's native menu; the web preview draws the same items.
 */
export function showContextMenu(items: ContextMenuItem[], at: { x: number; y: number }) {
  if (desktop) return desktop.showContextMenu(items);
  openMenu.get()?.resolve(null);
  return new Promise<string | null>((resolve) => openMenu.set({ items, ...at, resolve }));
}

function close(id: string | null) {
  openMenu.get()?.resolve(id);
  openMenu.set(null);
}

/** Where a menu opened from the keyboard appears: just inside the element's corner. */
export function menuPoint(event: { clientX?: number; clientY?: number; currentTarget: Element }) {
  if (event.clientX || event.clientY) return { x: event.clientX ?? 0, y: event.clientY ?? 0 };
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + 16, y: rect.top + 16 };
}

/** The preview's stand-in for the native menu. Renders nothing in the desktop app. */
export function ContextMenuLayer() {
  const menu = useStore(openMenu, (state) => state);
  if (desktop || !menu) return null;
  const anchor = {
    getBoundingClientRect: () => DOMRect.fromRect({ x: menu.x, y: menu.y, width: 0, height: 0 }),
  };
  return (
    <Menu.Root
      open
      onOpenChange={(open, details) => {
        // The right button's release lands outside the new menu; it opened it, so it must not close it.
        const event = details.event;
        if (details.reason === "outside-press" && "button" in event && event.button === 2) return;
        if (!open) close(null);
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={2}
          {...stylex.props(styles.positioner)}
        >
          <Menu.Popup {...stylex.props(styles.popup)}>
            {menu.items.map((item, index) =>
              item.type === "separator" ? (
                // oxlint-disable-next-line react/no-array-index-key -- separators have no identity of their own and the list never reorders while open.
                <Menu.Separator key={`separator-${index}`} {...stylex.props(styles.separator)} />
              ) : (
                <Menu.Item
                  key={item.id}
                  disabled={item.enabled === false}
                  onClick={() => close(item.id)}
                  className={(state) =>
                    stylex.props(
                      styles.item,
                      item.destructive && styles.destructive,
                      state.highlighted && styles.highlighted,
                      state.disabled && styles.disabled,
                    ).className ?? ""
                  }
                >
                  {item.label}
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const styles = stylex.create({
  positioner: { zIndex: 50, outline: "none" },
  popup: {
    minWidth: "200px",
    padding: space.s1,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    backgroundColor: color.raised,
    boxShadow: `0 18px 44px ${color.shadow}`,
    outline: "none",
  },
  item: {
    display: "flex",
    alignItems: "center",
    height: "28px",
    paddingInline: space.s3,
    borderRadius: "6px",
    fontFamily: font.body,
    fontSize: text.md,
    color: color.ink,
    cursor: "default",
    outline: "none",
    userSelect: "none",
  },
  highlighted: { backgroundColor: color.overlayActive, color: color.inkStrong },
  destructive: { color: color.danger },
  disabled: { opacity: 0.45 },
  separator: {
    height: "1px",
    marginBlock: space.s1,
    marginInline: space.s2,
    backgroundColor: color.border,
  },
});
