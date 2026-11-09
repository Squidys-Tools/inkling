import { srOnly } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "../mascot/motion.ts";

const DURATION = 500;
const EASE = "cubic-bezier(0.33, 1, 0.68, 1)";

const mod10 = (value: number) => ((value % 10) + 10) % 10;

type Column = {
  place: number;
  from: number;
  delta: number;
  enter: boolean;
  leave: boolean;
  group: boolean;
};

const buildColumns = (a: number, b: number): Column[] => {
  const before = String(a);
  const after = String(b);
  const length = Math.max(before.length, after.length);
  const up = b >= a;
  const columns: Column[] = [];
  for (let place = length - 1; place >= 0; place--) {
    const start = before[before.length - 1 - place];
    const end = after[after.length - 1 - place];
    const from = Number(start ?? 0);
    const base = up ? mod10(Number(end ?? 0) - from) : -mod10(from - Number(end ?? 0));
    // Lower places spin extra turns, so a big jump reads like an odometer.
    const turns = Math.min(Math.floor(Math.abs(b - a) / 10 ** (place + 1)), Math.max(0, 3 - place));
    columns.push({
      place,
      from,
      delta: base + (up ? 10 : -10) * turns,
      enter: start === undefined,
      leave: end === undefined,
      group: place > 0 && place % 3 === 0,
    });
  }
  return columns;
};

const separator =
  new Intl.NumberFormat().formatToParts(1_000_000).find((part) => part.type === "group")?.value ??
  ",";

/**
 * A whole, non-negative count that rolls from its last value to the new one, and up from 0 when
 * first shown. The digits roll on the compositor through the Web Animations API; only a column
 * entering or leaving animates width.
 */
export function AnimatedCount({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [roll, setRoll] = useState({ from: 0, to: value });
  if (roll.to !== value) setRoll({ from: roll.to, to: value });
  const columns = useMemo(() => buildColumns(roll.from, roll.to), [roll]);
  const boxes = useRef<(HTMLSpanElement | null)[]>([]);
  const strips = useRef<(HTMLSpanElement | null)[]>([]);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const stagger = columns.length > 1 ? Math.min(70, (DURATION * 0.4) / (columns.length - 1)) : 0;
    const duration = DURATION - stagger * (columns.length - 1);
    const animations: Animation[] = [];
    columns.forEach((column, index) => {
      const options = { duration, delay: index * stagger, easing: EASE, fill: "both" } as const;
      const strip = strips.current[index];
      if (strip && column.delta !== 0) {
        const far = `${(-Math.abs(column.delta) / (Math.abs(column.delta) + 1)) * 100}%`;
        const [start, end] = column.delta > 0 ? ["0%", far] : [far, "0%"];
        animations.push(
          strip.animate(
            [{ transform: `translateY(${start})` }, { transform: `translateY(${end})` }],
            options,
          ),
        );
      }
      const box = boxes.current[index];
      if (box && (column.enter || column.leave)) {
        const full = { width: `${box.scrollWidth}px`, opacity: 1 };
        const none = { width: "0px", opacity: 0 };
        animations.push(box.animate(column.enter ? [none, full] : [full, none], options));
      }
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [columns, reduced]);

  const label = value.toLocaleString();
  return (
    <span {...stylex.props(styles.root)}>
      <span aria-hidden="true" {...stylex.props(styles.visual)}>
        {reduced
          ? label
          : columns.map((column, index) => {
              const steps = Math.abs(column.delta);
              return (
                <span
                  key={column.place}
                  ref={(node) => {
                    boxes.current[index] = node;
                  }}
                  {...stylex.props(styles.box)}
                >
                  <span {...stylex.props(styles.window)}>
                    <span
                      ref={(node) => {
                        strips.current[index] = node;
                      }}
                      {...stylex.props(styles.strip)}
                    >
                      {Array.from({ length: steps + 1 }, (_, cell) => (
                        <span key={cell} {...stylex.props(styles.cell)}>
                          {mod10(
                            column.delta > 0 ? column.from + cell : column.from - steps + cell,
                          )}
                        </span>
                      ))}
                    </span>
                  </span>
                  {column.group && separator}
                </span>
              );
            })}
      </span>
      <span {...stylex.props(srOnly)}>{label}</span>
    </span>
  );
}

const styles = stylex.create({
  root: { fontVariantNumeric: "tabular-nums" },
  visual: {
    display: "inline-flex",
    verticalAlign: "top",
    whiteSpace: "pre",
    userSelect: "none",
  },
  box: { display: "inline-flex", overflow: "hidden" },
  window: { display: "inline-block", height: "1lh", overflow: "hidden" },
  strip: { display: "flex", flexDirection: "column" },
  cell: { height: "1lh" },
});
