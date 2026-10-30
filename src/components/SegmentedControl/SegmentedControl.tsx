// The coss ui segmented-control recipe, as published MIT in cosscom/coss
// packages/kloq @ 4339a256d21a3380745ba054f532e0ec5779930f
// (src/lib/segmented-control.ts). Copyright (c) 2026 Sean Brydon; see LICENSE.md
// in this directory. Rebuilt on native radios and plain CSS instead of Base UI
// and Tailwind. The sliding indicator is inkling's own: the one in coss's
// packages/ui is AGPL.

import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../ui/cx";
import "./SegmentedControl.css";

type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: string;
};

export function SegmentedControl<Value extends string>({
  name,
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Groups the radios, so it must be unique on the page. */
  name: string;
  /** Read by screen readers; not shown. */
  label: string;
  options: readonly SegmentedControlOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const item = root.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      setIndicator(item ? { left: item.offsetLeft, width: item.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [value]);

  return (
    <fieldset ref={rootRef} className={cx("segmented-control", className)}>
      <legend className="sr-only">{label}</legend>
      <span
        className="segmented-control-indicator"
        aria-hidden="true"
        hidden={!indicator}
        style={{ translate: `${indicator?.left ?? 0}px 0`, width: indicator?.width }}
      />
      {options.map((option) => (
        <label
          key={option.value}
          className="segmented-control-item"
          data-value={option.value}
          data-checked={option.value === value || undefined}
        >
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
