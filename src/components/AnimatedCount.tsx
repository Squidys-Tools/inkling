// Adapted from React Bits Count Up (https://reactbits.dev/text-animations/count-up).
// Copyright (c) 2026 David Haz. Licensed MIT + Commons Clause v1.0; the license
// text is in GradualBlur/LICENSE.md, which comes from the same project.
import { animate, cubicBezier } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { prefersReducedMotion } from "../ui/reducedMotion";

type Column = {
  slot: number;
  index: number;
  place: number;
  from: number;
  to: number;
  enter: boolean;
  leave: boolean;
  delta: number;
};

type Slot = Column | { char: string };

type Roll = { slots: Slot[]; columns: Column[]; label: string };

type Play = { id: number; from: number; to: number; spin: boolean; wait?: boolean };

const DURATION = 0.5;
const INTRO_DELAY = 0.5;
const CELL = 1.2;
const STAGGER = 0.07;
const UNITS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];
const SLOT_STYLE: CSSProperties = {
  display: "inline-block",
  height: `${CELL}em`,
  lineHeight: `${CELL}em`,
};
const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const mod10 = (value: number) => ((value % 10) + 10) % 10;

const ease = cubicBezier(0.33, 1, 0.68, 1);

const scaleFor = (value: number) => {
  const [size, label] = UNITS.find(([unit]) => value >= unit * 0.9995) || [1, ""];
  return { size, label, digits: label && value / size < 100 ? 1 : 0 };
};

const splitNumber = (value: number, digits: number, size: number) => {
  const [int, frac = ""] = (value / size).toFixed(digits).split(".");
  return { int, frac };
};

const formatValue = (value: number) => {
  const { size, label, digits } = scaleFor(value);
  const { int, frac } = splitNumber(value, digits, size);
  return `${int}${frac ? `.${frac}` : ""}${label}`;
};

const buildRoll = (a: number, b: number, spin: boolean): Roll => {
  const { size, label, digits } = scaleFor(b);
  const pa = splitNumber(a, digits, size);
  const pb = splitNumber(b, digits, size);
  const length = Math.max(pa.int.length, pb.int.length);
  const slots: Slot[] = [];
  const columns: Column[] = [];
  const digitAt = (parts: { int: string; frac: string }, place: number) => {
    if (place < 0) return Number(parts.frac[-place - 1]);
    const index = parts.int.length - 1 - place;
    return index >= 0 ? Number(parts.int[index]) : null;
  };
  for (let place = length - 1; place >= -digits; place--) {
    if (place === -1) slots.push({ char: "." });
    const start = digitAt(pa, place);
    const end = digitAt(pb, place);
    const column: Column = {
      slot: slots.length,
      index: columns.length,
      place,
      from: start ?? 0,
      to: end ?? 0,
      enter: start === null,
      leave: end === null,
      delta: 0,
    };
    slots.push(column);
    columns.push(column);
  }
  const up = spin || b >= a;
  columns.forEach((column, index) => {
    const rank = columns.length - 1 - index;
    const base = up ? mod10(column.to - column.from) : -mod10(column.from - column.to);
    const turns = spin
      ? Math.max(1, 3 - rank)
      : Math.min(
          Math.floor(Math.abs(b - a) / (size * 10 ** (column.place + 1))),
          Math.max(0, 3 - rank),
        );
    column.delta = base + (up ? 10 : -10) * turns;
  });
  return { slots, columns, label };
};

/**
 * A count that rolls up when it first appears and replays on hover. `value` is a
 * count: whole and never negative. The delay only applies to the first run, so
 * later changes (a new search) show the right number at once.
 */
export function AnimatedCount({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const slotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const filterRefs = useRef<(SVGFEGaussianBlurElement | null)[]>([]);
  const uid = useId().replace(/[^\w-]/g, "");
  const valueRef = useRef(0);
  const runningRef = useRef(false);
  const introRef = useRef(true);
  const [play, setPlay] = useState<Play | null>(null);

  const model = useMemo(
    () => (play ? buildRoll(play.from, play.to, play.spin) : buildRoll(0, value, false)),
    [play, value],
  );

  useEffect(() => {
    setPlay((previous) => ({
      id: (previous?.id || 0) + 1,
      from: valueRef.current,
      to: value,
      spin: false,
      wait: true,
    }));
  }, [value]);

  useEffect(() => {
    if (!play || !ref.current) return undefined;

    const { columns: layout } = buildRoll(play.from, play.to, play.spin);
    const fontSize = parseFloat(getComputedStyle(ref.current).fontSize) || 16;
    const cell = CELL * fontSize;
    const stagger =
      layout.length > 1 ? Math.min(STAGGER, (DURATION * 0.4) / (layout.length - 1)) : 0;
    const span = Math.max(0.001, DURATION - stagger * (layout.length - 1));
    const columns = layout.map((column) => {
      const box = slotRefs.current[column.slot];
      const strip = box?.firstChild as HTMLSpanElement | null;
      return {
        ...column,
        box,
        strip,
        blur: filterRefs.current[column.index],
        cells: strip
          ? Array.from(strip.childNodes, (node) => node.firstChild)
          : ([] as (ChildNode | null)[]),
        width: box ? box.scrollWidth : 0,
        base: Math.floor(column.from),
        sigma: 0,
      };
    });

    const fade = (node: HTMLSpanElement, width: number, presence: number, settled: boolean) => {
      node.style.width = settled ? "" : `${(presence * width).toFixed(2)}px`;
      node.style.opacity = settled ? "" : presence.toFixed(3);
    };

    const render = (t: number) => {
      columns.forEach((column, index) => {
        if (!column.strip) return;
        const u = clamp01((t - index * stagger) / span);
        const pos = column.from + column.delta * ease(u);
        const base = Math.floor(pos);
        if (base !== column.base) {
          column.base = base;
          column.cells.forEach((node, offset) => {
            if (node) node.nodeValue = String(mod10(base + offset - 1));
          });
        }
        column.strip.style.transform = `translateY(${(-(1 + pos - base) * CELL).toFixed(4)}em)`;

        const u0 = Math.max(0, u - 0.004);
        const u1 = Math.min(1, u + 0.004);
        const speed =
          u1 > u0 ? (Math.abs(column.delta) * Math.abs(ease(u1) - ease(u0))) / (u1 - u0) / span : 0;
        const sigma = u > 0 && u < 1 ? Math.min(cell * 0.05, (speed * cell) / 600) : 0;
        if (Math.abs(sigma - column.sigma) > 0.05 || (sigma === 0 && column.sigma !== 0)) {
          column.sigma = sigma;
          if (sigma > 0.2 && column.blur) {
            column.blur.setAttribute("stdDeviation", `0 ${sigma.toFixed(2)}`);
            column.strip.style.filter = `url(#${uid}-${index})`;
          } else {
            column.strip.style.filter = "";
          }
        }

        if (column.box && (column.enter || column.leave)) {
          const presence = column.enter ? smooth(0, 0.45, u) : 1 - smooth(0.55, 1, u);
          fade(column.box, column.width, presence, column.enter && u >= 1);
        }
      });

      valueRef.current = play.from + (play.to - play.from) * ease(clamp01(t / DURATION));
    };

    runningRef.current = true;

    const finish = () => {
      render(Infinity);
      valueRef.current = play.to;
      runningRef.current = false;
      // The library loads empty first; wait for a real count before dropping the delay.
      if (play.to > 0) introRef.current = false;
    };

    if (prefersReducedMotion()) {
      finish();
      return undefined;
    }

    const controls = animate(0, DURATION, {
      duration: DURATION,
      delay: play.wait && introRef.current ? INTRO_DELAY : 0,
      ease: "linear",
      onUpdate: render,
      onComplete: finish,
    });

    return () => {
      controls.stop();
      runningRef.current = false;
    };
  }, [play, uid]);

  const replay = () => {
    if (runningRef.current) return;
    setPlay((previous) => ({
      id: (previous?.id || 0) + 1,
      from: valueRef.current,
      to: valueRef.current,
      spin: true,
    }));
  };

  return (
    <span
      className={className}
      ref={ref}
      style={{ fontVariantNumeric: "tabular-nums" }}
      onPointerEnter={replay}
    >
      <span
        key={`roll-${play?.id || 0}`}
        aria-hidden="true"
        style={{ display: "inline-flex", whiteSpace: "pre", userSelect: "none" }}
      >
        {model.slots.map((slot, index) => {
          if ("char" in slot) {
            return (
              <span
                // oxlint-disable-next-line react/no-array-index-key -- slots are positional and index-addressed via slotRefs
                key={index}
                style={{ ...SLOT_STYLE, overflow: "hidden" }}
              >
                {slot.char}
              </span>
            );
          }
          const collapsed = slot.enter ? { width: 0, opacity: 0 } : null;
          return (
            <span
              // oxlint-disable-next-line react/no-array-index-key -- slots are positional and index-addressed via slotRefs
              key={index}
              ref={(node) => {
                slotRefs.current[index] = node;
              }}
              style={{ ...SLOT_STYLE, position: "relative", overflow: "hidden", ...collapsed }}
            >
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  transform: `translateY(${-CELL}em)`,
                }}
              >
                {[-1, 0, 1, 2].map((offset) => (
                  <span key={offset} style={{ height: `${CELL}em` }}>
                    {mod10(slot.from + offset)}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
        {model.label && <span style={SLOT_STYLE}>{model.label}</span>}
      </span>
      <span style={SR_ONLY}>{formatValue(play ? play.to : value)}</span>
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          {model.columns.map((column) => (
            <filter
              key={column.index}
              id={`${uid}-${column.index}`}
              x="-20%"
              y="-50%"
              width="140%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                ref={(node) => {
                  filterRefs.current[column.index] = node;
                }}
                stdDeviation="0 0"
              />
            </filter>
          ))}
        </defs>
      </svg>
    </span>
  );
}
