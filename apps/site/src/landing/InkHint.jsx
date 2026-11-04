import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { usePresence } from "motion/react";
const EMERGE = "cubic-bezier(.34,1.25,.5,1)";
const SUCK = "cubic-bezier(.5,0,.8,.4)";
// [offset, pull toward bubble (px at 160px mascot), stretch along the axis, stretch across it]
const OPEN_POSE = [
  [0, 0, 1, 1],
  [0.14, -6, 1.05, 0.93],
  [0.4, 8, 1.12, 0.92],
  [0.53, 10, 1.15, 0.9],
  [0.59, -3, 0.9, 1.08],
  [0.72, 1, 0.97, 0.97],
  [0.86, 0, 0.94, 0.96],
  [1, 0, 0.95, 0.95],
];
const CLOSE_POSE = [
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
const live = (el, property) => getComputedStyle(el)[property];
const play = (list, el, keyframes, options) => {
  const animation = el.animate(keyframes, { fill: "both", ...options });
  list.push(animation);
  return animation.finished.catch(() => {});
};
// Offsets are in the bubble's frame, along the line from the mascot's center to the bubble's.
function measure(trigger, box) {
  const m = trigger.getBoundingClientRect(),
    b = box.getBoundingClientRect(),
    pad = parseFloat(getComputedStyle(box).getPropertyValue("--ink-pad")) || 0,
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
    neckX: pad + m.left + m.width / 2 - b.left + ux * r * 0.9,
    neckY: pad + m.top + m.height / 2 - b.top + uy * r * 0.9,
  };
}
const placeDrop = (drop, i, g) => {
  const s = DROPS[i] * g.k;
  drop.style.cssText = `left:${g.neckX - s / 2}px;top:${g.neckY - s / 2}px;width:${s}px;height:${s}px`;
};
const pose = (g, rows) =>
  rows.map(([offset, pull, along, across]) => ({
    offset,
    easing: "ease-in-out",
    transform: `translate(${g.ux * pull * g.k}px,${g.uy * pull * g.k}px) rotate(${g.angle}rad) scale(${along},${across}) rotate(${-g.angle}rad)`,
  }));
export function InkHint({ trigger, getCharacter, reduced, register, tip, ref, ...props }) {
  const [present, safeToRemove] = usePresence(),
    id = React.useId(),
    box = React.useRef(null),
    blob = React.useRef(null),
    tether = React.useRef(null),
    text = React.useRef(null),
    close = React.useRef(null),
    drops = React.useRef([]),
    animations = React.useRef([]),
    shown = React.useRef(false),
    leaving = React.useRef(false),
    session = React.useRef(0),
    done = React.useRef(safeToRemove);
  // Every cancel starts a new session, so a swallow in flight stops instead of touching unmounted nodes.
  const settle = React.useCallback(() => {
    session.current += 1;
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
    const figure = getCharacter();
    if (figure) figure.style.transformOrigin = "";
  }, [getCharacter]);
  const emerge = React.useCallback(() => {
    const figure = getCharacter();
    settle();
    shown.current = true;
    const g = measure(trigger.current, box.current),
      list = animations.current,
      th = `rotate(${g.angle}rad)`;
    figure.style.transformOrigin = "50% 60%";
    play(list, figure, pose(g, OPEN_POSE), { duration: 1300, easing: "linear" });
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
    play(list, text.current, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1 }], {
      duration: 300,
      delay: 640,
    });
    play(list, close.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 700 });
  }, [trigger, getCharacter, settle]);
  // Resolves false when a reopen or unmount settled before the swallow finished.
  const swallow = React.useCallback(async () => {
    const mine = session.current,
      figure = getCharacter(),
      g = measure(trigger.current, box.current),
      list = animations.current,
      th = `rotate(${g.angle}rad)`;
    await Promise.all(
      [text.current, close.current].map((el) =>
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
    frames[0].transform = live(figure, "transform");
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
      play(list, figure, frames, { duration: 1160, easing: "linear" }),
      play(
        list,
        blob.current,
        [
          {
            opacity: live(blob.current, "opacity"),
            transform: live(blob.current, "transform"),
            borderRadius: live(blob.current, "borderRadius"),
          },
          { opacity: 1, transform: `${g.mouth} scale(.1,.22)`, borderRadius: "90px" },
        ],
        { duration: 600, easing: SUCK },
      ),
    ]);
    return session.current === mine;
  }, [trigger, getCharacter]);
  React.useLayoutEffect(() => {
    if (reduced) return;
    register(emerge);
    return () => {
      register(null);
      settle();
    };
  }, [reduced, register, emerge, settle]);
  React.useEffect(() => {
    done.current = safeToRemove;
  });
  React.useEffect(() => {
    if (present) {
      if (leaving.current && !reduced) emerge();
      leaving.current = false;
      return;
    }
    leaving.current = true;
    if (reduced || !shown.current) {
      done.current?.();
      return;
    }
    // The unmount settles; settling here first would flash the text for a frame before removal.
    swallow().then((finished) => finished && done.current?.());
  }, [present, reduced, emerge, swallow]);
  return (
    <div
      {...props}
      ref={(el) => {
        box.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      inert={present ? undefined : true}
      className={reduced ? "mascot-hint ink-plain" : "mascot-hint"}
    >
      {!reduced && (
        <>
          <svg className="ink-defs" width="0" height="0" aria-hidden="true">
            <filter id={id} colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceGraphic" stdDeviation="7" />
              <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
            </filter>
          </svg>
          <span className="ink-layer" aria-hidden="true" style={{ filter: `url("#${id}")` }}>
            <span ref={blob} className="ink-blob" />
            <span ref={tether} className="ink-tether" />
            {DROPS.map((size, i) => (
              <span
                key={size}
                ref={(el) => {
                  drops.current[i] = el;
                }}
                className="ink-drop"
              />
            ))}
          </span>
        </>
      )}
      <p ref={text}>{tip}</p>
      <Popover.Close ref={close} className="hint-close" aria-label="Close hint">
        ×
      </Popover.Close>
    </div>
  );
}
