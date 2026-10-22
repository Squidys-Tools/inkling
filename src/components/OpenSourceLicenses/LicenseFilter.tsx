import { PlusSignCircleIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

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

export function LicenseFilter({ counts, selected, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>("[role=menuitemcheckbox]")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss, true);
    return () => window.removeEventListener("pointerdown", dismiss, true);
  }, [open]);

  const toggle = (license: string) => {
    const next = new Set(selected);
    if (!next.delete(license)) next.add(license);
    onChange(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role^=menuitem]")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") focusAt(index + 1);
    else if (event.key === "ArrowUp") focusAt(index - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(-1);
    else if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      buttonRef.current?.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const picked = counts.filter(([license]) => selected.has(license));
  return (
    <div ref={rootRef} className="license-filter">
      <button
        ref={buttonRef}
        type="button"
        className="license-filter-button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <HugeiconsIcon icon={PlusSignCircleIcon} size={14} />
        License
        {picked.length > 0 && (
          <>
            <span className="license-filter-divider" />
            {picked.length > MAX_BADGES ? (
              <span className="license-filter-badge">{picked.length} selected</span>
            ) : (
              picked.map(([license]) => (
                <span key={license} className="license-filter-badge">
                  {license}
                </span>
              ))
            )}
          </>
        )}
      </button>
      {open && (
        <div
          ref={listRef}
          className="license-filter-menu"
          role="menu"
          aria-label="Filter by license"
          onKeyDown={onKeyDown}
        >
          <div className="license-filter-options">
            {counts.map(([license, count]) => {
              const checked = selected.has(license);
              return (
                <button
                  key={license}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  tabIndex={-1}
                  className="license-filter-option"
                  onClick={() => toggle(license)}
                >
                  <span className="license-filter-check">
                    {checked && <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2.4} />}
                  </span>
                  <span className="license-filter-label">{license}</span>
                  <span className="license-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="license-filter-clear"
              onClick={() => {
                onChange(new Set());
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
