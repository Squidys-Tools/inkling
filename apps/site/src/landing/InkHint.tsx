import * as stylex from "@stylexjs/stylex";
import { Popover } from "@base-ui/react/popover";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { type RefObject, useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { base } from "./base.ts";

const EMERGE = "cubic-bezier(.34,1.25,.5,1)";
const SUCK = "cubic-bezier(.5,0,.8,.4)";
// How far the ink layer reaches past the bubble, so the goo filter is not clipped.
const INK_PAD = 200;
// [offset, pull toward bubble (px at 160px mascot), stretch along the axis, stretch across it]
type Pose = [number, number, number, number][];
const OPEN_POSE: Pose = [
  [0, 0, 1, 1],
  [0.14, -6, 1.05, 0.93],
  [0.4, 8, 1.12, 0.92],
  [0.53, 10, 1.15, 0.9],
  [0.59, -3, 0.9, 1.08],
  [0.72, 1, 0.97, 0.97],
  [0.86, 0, 0.94, 0.96],
  [1, 0, 0.95, 0.95],
];
const CLOSE_POSE: Pose = [
  [0, 0, 0.95, 0.95],
  [0.12, 0, 0.95, 0.95],
  [0.45, 7, 1.1, 0.92],
  [0.56, 4, 1.15, 0.88],
  [0.64, 0, 1.13, 1.13],
  [0.78, 0, 0.97, 1.05],
  [0.9, 0, 1.015, 0.99],
  [1, 0, 1, 1],
];
const DROPS = [24, 17, 12];

const live = (el: Element, property: "opacity" | "transform" | "borderRadius") =>
  getComputedStyle(el)[property];
const play = (
  list: Animation[],
  el: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
) => {
  const animation = el.animate(keyframes, { fill: "both", ...options });
  list.push(animation);
  return animation.finished.catch(() => {});
};

type Geometry = ReturnType<typeof measure>;

// Offsets are in the bubble's frame, along the line from the mascot's center to the bubble's.
function measure(trigger: Element, box: Element) {
  const m = trigger.getBoundingClientRect(),
    b = box.getBoundingClientRect(),
    vx = b.left + b.width / 2 - (m.left + m.width / 2),
    vy = b.top + b.height / 2 - (m.top + m.height / 2),
    d = Math.hypot(vx, vy) || 1,
    ux = vx / d,
    uy = vy / d,
    r = m.width * 0.36,
    edge = Math.min(b.width / 2 / (Math.abs(ux) || 1e-6), b.height / 2 / (Math.abs(uy) || 1e-6)),
    reach = d - r * 0.9;
  return {
    ux,
    uy,
    angle: Math.atan2(uy, ux),
    k: Math.min(1.2, Math.max(0.6, m.width / 160)),
    reach,
    travel: reach - edge + 18,
    mouth: `translate(${-vx + ux * r * 0.5}px,${-vy + uy * r * 0.5}px)`,
    // Where the neck leaves the mascot, in ink-layer coordinates.
    neckX: INK_PAD + m.left + m.width / 2 - b.left + ux * r * 0.9,
    neckY: INK_PAD + m.top + m.height / 2 - b.top + uy * r * 0.9,
  };
}

const placeDrop = (drop: HTMLElement, i: number, g: Geometry) => {
  const s = DROPS[i]! * g.k;
  drop.style.cssText = `left:${g.neckX - s / 2}px;top:${g.neckY - s / 2}px;width:${s}px;height:${s}px`;
};

const pose = (g: Geometry, rows: Pose): Keyframe[] =>
  rows.map(([offset, pull, along, across]) => ({
    offset,
    easing: "ease-in-out",
    transform: `translate(${g.ux * pull * g.k}px,${g.uy * pull * g.k}px) rotate(${g.angle}rad) scale(${along},${across}) rotate(${-g.angle}rad)`,
  }));

// The tip bubble. Outside reduced motion it squeezes out of the mascot as ink while
// open, and is swallowed back before `onSwallowed` lets the popover unmount it.
export function InkHint({
  open,
  box,
  label,
  tip,
  reduced,
  compact,
  trigger,
  getFigure,
  onSwallowed,
}: {
  open: boolean;
  box: RefObject<HTMLDivElement | null>;
  label: string;
  tip: string;
  reduced: boolean;
  compact: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  getFigure: () => HTMLElement | null;
  onSwallowed: () => void;
}) {
  const id = useId(),
    blob = useRef<HTMLSpanElement>(null),
    tether = useRef<HTMLSpanElement>(null),
    text = useRef<HTMLParagraphElement>(null),
    close = useRef<HTMLButtonElement>(null),
    drops = useRef<HTMLSpanElement[]>([]),
    animations = useRef<Animation[]>([]),
    shown = useRef(false),
    leaving = useRef(false),
    session = useRef(0),
    swallowed = useRef(onSwallowed);

  // Every cancel starts a new session, so a swallow in flight stops instead of touching unmounted nodes.
  const settle = useCallback(() => {
    session.current += 1;
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
    const figure = getFigure();
    if (figure) figure.style.transformOrigin = "";
  }, [getFigure]);

  const emerge = useCallback(() => {
    const character = getFigure();
    if (!trigger.current || !box.current || !blob.current || !tether.current || !character) return;
    settle();
    shown.current = true;
    const g = measure(trigger.current, box.current),
      list = animations.current,
      th = `rotate(${g.angle}rad)`;
    character.style.transformOrigin = "50% 60%";
    play(list, character, pose(g, OPEN_POSE), { duration: 1300, easing: "linear" });
    play(
      list,
      blob.current,
      [
        { opacity: 1, transform: `${g.mouth} scale(.1,.22)`, borderRadius: "90px" },
        { opacity: 1, transform: "translate(0,0) scale(1,1)", borderRadius: "22px" },
      ],
      { duration: 640, delay: 160, easing: EMERGE },
    );
    tether.current.style.cssText = `left:${g.neckX}px;top:${g.neckY - 14}px;width:${g.reach}px`;
    play(
      list,
      tether.current,
      [
        { opacity: 1, transform: `${th} scale(.05,.8)` },
        { opacity: 1, transform: `${th} scale(.55,.5)`, offset: 0.45 },
        { opacity: 1, transform: `${th} scale(1,.16)`, offset: 0.85 },
        { opacity: 1, transform: `${th} scale(1,.04)` },
      ],
      { duration: 640, delay: 160, easing: EMERGE },
    );
    drops.current.forEach((d, i) => {
      placeDrop(d, i, g);
      play(
        list,
        d,
        [
          { opacity: 1, transform: "translate(0,0) scale(.4)" },
          {
            opacity: 1,
            transform: `translate(${g.ux * g.travel * 0.55}px,${g.uy * g.travel * 0.55}px) scale(1)`,
            offset: 0.6,
          },
          {
            opacity: 1,
            transform: `translate(${g.ux * g.travel}px,${g.uy * g.travel}px) scale(.6)`,
          },
        ],
        { duration: 540, delay: 200 + i * 90, easing: "ease-in-out" },
      );
    });
    if (text.current)
      play(list, text.current, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1 }], {
        duration: 300,
        delay: 640,
      });
    if (close.current)
      play(list, close.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 700 });
  }, [trigger, getFigure, box, settle]);

  // Resolves false when a reopen or unmount settled before the swallow finished.
  const swallow = useCallback(async () => {
    const mine = session.current,
      character = getFigure();
    if (!trigger.current || !box.current || !blob.current || !tether.current || !character)
      return true;
    const g = measure(trigger.current, box.current),
      list = animations.current,
      th = `rotate(${g.angle}rad)`,
      ink = blob.current;
    await Promise.all(
      [text.current, close.current].map(
        (el) =>
          el &&
          play(list, el, [{ opacity: live(el, "opacity") }, { opacity: 0 }], { duration: 140 }),
      ),
    );
    if (session.current !== mine) return false;
    drops.current.forEach((d, i) => {
      placeDrop(d, i, g);
      play(
        list,
        d,
        [
          {
            opacity: 1,
            transform: `translate(${g.ux * g.travel}px,${g.uy * g.travel}px) scale(.6)`,
          },
          { opacity: 1, transform: "translate(0,0) scale(.4)" },
        ],
        { duration: 380, delay: 80 + i * 80, easing: "ease-in" },
      );
    });
    const frames = pose(g, CLOSE_POSE);
    frames[0]!.transform = live(character, "transform");
    play(
      list,
      tether.current,
      [
        { opacity: 1, transform: `${th} scale(1,.5)` },
        { opacity: 1, transform: `${th} scale(.55,.45)`, offset: 0.6 },
        { opacity: 1, transform: `${th} scale(.05,.7)` },
      ],
      { duration: 600, easing: SUCK },
    );
    await Promise.all([
      play(list, character, frames, { duration: 1160, easing: "linear" }),
      play(
        list,
        ink,
        [
          {
            opacity: live(ink, "opacity"),
            transform: live(ink, "transform"),
            borderRadius: live(ink, "borderRadius"),
          },
          { opacity: 1, transform: `${g.mouth} scale(.1,.22)`, borderRadius: "90px" },
        ],
        { duration: 600, easing: SUCK },
      ),
    ]);
    return session.current === mine;
  }, [trigger, getFigure, box]);

  useEffect(() => {
    swallowed.current = onSwallowed;
  });

  // The positioner stays transparent until Base UI has placed it; the ink measures from there.
  useLayoutEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = () => {
      const positioner = box.current?.parentElement;
      if (positioner && positioner.style.opacity !== "0") emerge();
      else frame = requestAnimationFrame(start);
    };
    start();
    return () => {
      cancelAnimationFrame(frame);
      settle();
    };
  }, [reduced, box, emerge, settle]);

  useEffect(() => {
    if (open) {
      if (leaving.current && !reduced) emerge();
      leaving.current = false;
      return;
    }
    leaving.current = true;
    if (reduced || !shown.current) {
      swallowed.current();
      return;
    }
    // The unmount settles; settling here first would flash the text for a frame before removal.
    void swallow().then((finished) => finished && swallowed.current());
  }, [open, reduced, emerge, swallow]);

  return (
    <Popover.Popup
      ref={box}
      aria-label={label}
      finalFocus={false}
      inert={open ? undefined : true}
      {...stylex.props(styles.hint, reduced && styles.plain, compact && styles.compact)}
    >
      {!reduced && (
        <>
          <svg width="0" height="0" aria-hidden="true" {...stylex.props(styles.defs)}>
            <filter id={id} colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceGraphic" stdDeviation="7" />
              <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
            </filter>
          </svg>
          <span aria-hidden="true" {...stylex.props(styles.layer(`url("#${id}")`))}>
            <span ref={blob} {...stylex.props(styles.ink, styles.blob)} />
            <span ref={tether} {...stylex.props(styles.ink, styles.tether)} />
            {DROPS.map((size, i) => (
              <span
                key={size}
                ref={(el) => {
                  if (el) drops.current[i] = el;
                }}
                {...stylex.props(styles.ink, styles.drop)}
              />
            ))}
          </span>
        </>
      )}
      <p ref={text} {...stylex.props(base.flush, styles.text)}>
        {tip}
      </p>
      <Popover.Close
        ref={close}
        aria-label="Close hint"
        {...stylex.props(base.button, base.focus, styles.close)}
      >
        ×
      </Popover.Close>
    </Popover.Popup>
  );
}

const styles = stylex.create({
  hint: {
    boxSizing: "border-box",
    position: "relative",
    zIndex: 60,
    maxWidth: "min(300px, calc(100vw - 32px))",
    padding: "24px 50px 24px 24px",
    borderRadius: "22px",
    color: landingColor.paper,
    fontSize: "1rem",
    lineHeight: 1.45,
  },
  plain: { backgroundColor: landingColor.ink },
  compact: { maxWidth: "min(300px, calc(100vw - 48px), var(--available-width))" },
  defs: { position: "absolute" },
  layer: (filter: string) => ({
    position: "absolute",
    inset: `-${INK_PAD}px`,
    pointerEvents: "none",
    filter,
  }),
  ink: { position: "absolute", backgroundColor: landingColor.ink, opacity: 0 },
  blob: { inset: `${INK_PAD}px`, borderRadius: "22px" },
  tether: { height: "28px", borderRadius: "14px", transformOrigin: "0 50%" },
  drop: { borderRadius: "50%" },
  text: { position: "relative" },
  close: {
    position: "absolute",
    right: "8px",
    top: "8px",
    minWidth: "40px",
    minHeight: "40px",
    borderStyle: "none",
    borderRadius: "50%",
    backgroundColor: { default: "transparent", ":hover": landingColor.closeHover },
    color: "inherit",
    fontSize: "1.5rem",
  },
});
