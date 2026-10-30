import { Menu } from "@base-ui/react/menu";
import { type ReactNode, useRef, useState } from "react";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import { focusFirstMenuItem } from "../../ui/Menu";
import { SpaceMark } from "../../ui/SpaceMark";
import { hostnameForUrl } from "../hostname";
import type { ItemViewActions, ItemViewSpace } from "./ItemView";

const BAR_BUTTON =
  "grid size-8 cursor-pointer place-items-center rounded-[8px] border-0 bg-transparent text-muted hover:bg-glass-active hover:text-ink";

// Action bar glyphs, drawn at Paper's 15px with a 1.8 stroke.
function BarGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function SpaceMenu({
  item,
  spaces,
  onToggleSpace,
}: {
  item: LibraryItem;
  spaces: ItemViewSpace[];
  onToggleSpace?: ItemViewActions["onToggleSpace"];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
      <Menu.Trigger
        ref={triggerRef}
        className={BAR_BUTTON}
        aria-label="Move to Space"
        data-tooltip="Move to Space"
      >
        <BarGlyph>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </BarGlyph>
      </Menu.Trigger>
      <span ref={containerRef} className="contents" />
      {/* Kept inside the item view so its stacking and focus handling still hold. */}
      <Menu.Portal container={containerRef}>
        {/* The offset lines the popup's bottom up 6px above the bar's top border. */}
        <Menu.Positioner side="top" align="start" sideOffset={12.5} className="z-2">
          <Menu.Popup
            className="max-h-[280px] w-[232px] overflow-y-auto rounded-[12px] border border-border bg-surface p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] outline-none transition-[opacity,translate] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] data-starting-style:translate-y-1 data-starting-style:opacity-0 motion-reduce:transition-none"
            onFocus={focusFirstMenuItem}
            onKeyDown={(event) => {
              // Escape here closes only the menu, never the item view.
              if (event.key !== "Escape" && event.key !== "Tab") return;
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            }}
          >
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1.5 font-body text-[11px]/[14px] font-medium tracking-[0.02em] text-muted">
                Keep in a Space
              </Menu.GroupLabel>
              {spaces.map((space) => (
                <Menu.CheckboxItem
                  key={space.id}
                  checked={space.member}
                  onCheckedChange={() => void onToggleSpace?.(item, space.id)}
                  data-tooltip={space.member ? `Remove from ${space.name}` : `Add to ${space.name}`}
                  className="group flex h-8 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-left font-body text-[13px] leading-[normal] text-ink-soft data-checked:text-ink data-highlighted:bg-glass-active data-highlighted:text-ink"
                >
                  <SpaceMark small color={space.color} className="flex-none" />
                  <span className="min-w-0 flex-auto truncate">{space.name}</span>
                  <svg
                    className="flex-none text-accent opacity-0 group-data-checked:opacity-100"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </Menu.CheckboxItem>
              ))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function ItemActionBar({
  item,
  actions,
  spaces,
  onArchive,
}: {
  item: LibraryItem;
  actions: ItemViewActions;
  spaces?: ItemViewSpace[];
  onArchive: () => void;
}) {
  const sourceHost = hostnameForUrl(item.sourceUrl);
  const openLabel = `Open ${sourceHost ?? "original"}`;
  return (
    <footer className="relative mt-3 flex h-11 flex-none items-center gap-1 border-t border-border">
      {spaces && spaces.length > 0 && (
        <SpaceMenu
          key={item.id}
          item={item}
          spaces={spaces}
          onToggleSpace={actions.onToggleSpace}
        />
      )}
      {item.sourceUrl && (
        <button
          type="button"
          className={BAR_BUTTON}
          onClick={() => window.open(item.sourceUrl, "_blank", "noopener,noreferrer")}
          aria-label={openLabel}
          data-tooltip={openLabel}
        >
          <BarGlyph>
            <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
          </BarGlyph>
        </button>
      )}
      {actions.onShowInFolder && (
        <button
          type="button"
          className={BAR_BUTTON}
          onClick={() => actions.onShowInFolder?.(item)}
          aria-label="Show in folder"
          data-tooltip="Show in folder"
        >
          <BarGlyph>
            <path d="M3 18V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1" />
            <path d="M3 18l2.6-6.4A2 2 0 0 1 7.5 10H21l-2.8 7.4A2 2 0 0 1 16.3 19H4a1 1 0 0 1-1-1z" />
          </BarGlyph>
        </button>
      )}
      <button
        type="button"
        className={BAR_BUTTON}
        onClick={onArchive}
        aria-label="Archive"
        data-tooltip="Archive"
      >
        <BarGlyph>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
        </BarGlyph>
      </button>
      {actions.onDelete && item.archived && (
        <button
          type="button"
          className={cx(BAR_BUTTON, "ml-auto")}
          onClick={() => actions.onDelete?.(item)}
          aria-label="Delete permanently"
          data-tooltip="Delete permanently"
        >
          <BarGlyph>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </BarGlyph>
        </button>
      )}
    </footer>
  );
}
