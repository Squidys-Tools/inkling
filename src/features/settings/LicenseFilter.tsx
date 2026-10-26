import { Menu } from "@base-ui/react/menu";
import { PlusSignCircleIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import { cx } from "../../ui/cx";
import { focusFirstMenuItem, MENU_ITEM, MENU_POPUP_MOTION } from "../../ui/Menu";

// A faceted filter in the shape of shadcn/ui's data table example: a dashed
// button that lists the picked values, over a checklist with counts. Picking
// keeps the list open so several licenses can be combined.

type Props = {
  counts: ReadonlyArray<readonly [license: string, count: number]>;
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
  disabled: boolean;
};

const MAX_BADGES = 2;
const BADGE =
  "min-w-0 overflow-hidden rounded-[6px] bg-glass-active px-[7px] py-0.5 font-mono text-[11px]/[14px] font-normal text-ellipsis text-ink";

export function LicenseFilter({ counts, selected, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggle = (license: string) => {
    const next = new Set(selected);
    if (!next.delete(license)) next.add(license);
    onChange(next);
  };

  const picked = counts.filter(([license]) => selected.has(license));
  return (
    <div ref={rootRef} className="relative z-2 min-w-0 flex-[0_1_auto]">
      <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
        <Menu.Trigger
          ref={triggerRef}
          disabled={disabled}
          className="flex h-[34px] max-w-full cursor-pointer items-center gap-[7px] rounded-full border border-dashed border-[#3a3530] bg-transparent py-0 pr-3 pl-2.5 font-body text-[12px]/4 font-medium whitespace-nowrap text-ink-soft transition-[background-color,border-color,color] duration-180 ease-[ease] enabled:hover:border-[#4a443d] enabled:hover:bg-glass-active enabled:hover:text-ink disabled:cursor-default disabled:opacity-50 data-popup-open:border-[#4a443d] data-popup-open:bg-glass-active data-popup-open:text-ink [&>svg]:flex-none [&>svg]:text-muted"
        >
          <HugeiconsIcon icon={PlusSignCircleIcon} size={14} />
          License
          {picked.length > 0 && (
            <>
              <span className="mx-0.5 h-3.5 w-px bg-[#3a3530]" />
              {picked.length > MAX_BADGES ? (
                <span className={BADGE}>{picked.length} selected</span>
              ) : (
                picked.map(([license]) => (
                  <span key={license} className={BADGE}>
                    {license}
                  </span>
                ))
              )}
            </>
          )}
        </Menu.Trigger>
        {/* Kept inside the sheet so its Tab trap and stacking still hold. */}
        <Menu.Portal container={rootRef}>
          <Menu.Positioner side="bottom" align="end" sideOffset={6}>
            <Menu.Popup
              aria-label="Filter by license"
              className={cx(
                "w-[250px] origin-top-right rounded-[12px] border border-border bg-surface p-[5px] shadow-[0_16px_40px_rgba(0,0,0,0.5)]",
                MENU_POPUP_MOTION,
              )}
              onFocus={focusFirstMenuItem}
              onKeyDown={(event) => {
                // Escape here must not reach the window, where it closes Settings.
                if (event.key !== "Escape" && event.key !== "Tab") return;
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <div className="max-h-[300px] overflow-y-auto [scrollbar-color:#4a4842_transparent] [scrollbar-width:thin]">
                {counts.map(([license, count]) => (
                  <Menu.CheckboxItem
                    key={license}
                    checked={selected.has(license)}
                    onCheckedChange={() => toggle(license)}
                    className={cx(MENU_ITEM, "group text-ink-soft")}
                  >
                    <span className="grid size-[15px] flex-none place-items-center rounded-[4px] border border-[#4a443d] text-frame group-data-checked:border-ink group-data-checked:bg-ink">
                      <Menu.CheckboxItemIndicator className="flex">
                        <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2.4} />
                      </Menu.CheckboxItemIndicator>
                    </span>
                    <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap">
                      {license}
                    </span>
                    <span className="flex-none font-mono text-[11px]/4 font-normal text-muted">
                      {count}
                    </span>
                  </Menu.CheckboxItem>
                ))}
              </div>
              {selected.size > 0 && (
                <Menu.Item
                  className={cx(MENU_ITEM, "justify-center text-muted")}
                  onClick={() => onChange(new Set())}
                >
                  Clear filter
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
