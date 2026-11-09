import * as stylex from "@stylexjs/stylex";
import { srOnly } from "@inkling/ui";
import { color, font, motion, radius, text } from "@inkling/ui/tokens.stylex";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * The size control under a photo or video: a fixed-width pill. At a limit the
 * unavailable button slides out and the value grows into its space, and each
 * step rolls the changed digits toward the new value.
 */
export function SizeStepper({
  label,
  percent,
  canShrink,
  canGrow,
  onShrink,
  onGrow,
}: {
  label: string;
  percent: number;
  canShrink: boolean;
  canGrow: boolean;
  onShrink: () => void;
  onGrow: () => void;
}) {
  const shrinkRef = useRef<HTMLButtonElement>(null);
  const growRef = useRef<HTMLButtonElement>(null);
  const pressed = useRef<"shrink" | "grow" | null>(null);
  // The value shown before this step, kept from the previous render, so the
  // changed digits can roll away from it.
  const [last, setLast] = useState({ percent, before: percent });
  if (last.percent !== percent) setLast({ percent, before: last.percent });
  const direction = percent >= last.before ? "up" : "down";
  const before = String(last.before);
  const after = String(percent);

  // A button that just reached its limit leaves, so focus moves to the one that stays.
  // Keyed to the pressed button, not activeElement: disabling it may already have moved focus to body.
  useLayoutEffect(() => {
    if (!canShrink && pressed.current === "shrink") growRef.current?.focus();
    if (!canGrow && pressed.current === "grow") shrinkRef.current?.focus();
    // One press, one handoff: a later wheel or pinch to a limit must not move focus.
    pressed.current = null;
  }, [canShrink, canGrow]);

  const width = Math.max(before.length, after.length);
  const shown = after.padStart(width, " ");
  const old = before.padStart(width, " ");
  // Keyed by place value (ones, tens, hundreds), so a digit keeps its cell.
  const places = [...shown].map((digit, at) => ({ digit, was: old[at], place: width - at }));

  return (
    <div role="group" aria-label={label} {...stylex.props(styles.stepper)}>
      <button
        ref={shrinkRef}
        type="button"
        aria-label={`Smaller (${label.toLowerCase()})`}
        title="Smaller"
        disabled={!canShrink}
        tabIndex={canShrink ? 0 : -1}
        onClick={() => {
          pressed.current = "shrink";
          onShrink();
        }}
        {...stylex.props(styles.button, !canShrink && styles.gone)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" {...glyph} />
        </svg>
      </button>
      <span {...stylex.props(styles.value)}>
        <span aria-hidden="true" {...stylex.props(styles.digits)}>
          {places.map(({ digit, was, place }) =>
            digit === was ? (
              <span key={place} {...stylex.props(styles.cell)}>
                {digit}
              </span>
            ) : (
              <span key={`${place}-${percent}`} {...stylex.props(styles.cell)}>
                <span
                  {...stylex.props(
                    styles.roll,
                    styles.leaving,
                    direction === "up" ? styles.leaveUp : styles.leaveDown,
                  )}
                >
                  {was}
                </span>
                <span
                  {...stylex.props(
                    styles.roll,
                    direction === "up" ? styles.enterUp : styles.enterDown,
                  )}
                >
                  {digit}
                </span>
              </span>
            ),
          )}
          %
        </span>
        <span role="status" aria-live="polite" {...stylex.props(srOnly)}>
          {percent}%
        </span>
      </span>
      <button
        ref={growRef}
        type="button"
        aria-label={`Larger (${label.toLowerCase()})`}
        title="Larger"
        disabled={!canGrow}
        tabIndex={canGrow ? 0 : -1}
        onClick={() => {
          pressed.current = "grow";
          onGrow();
        }}
        {...stylex.props(styles.button, !canGrow && styles.gone)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" {...glyph} />
        </svg>
      </button>
    </div>
  );
}

const glyph = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
} as const;

const enterUp = stylex.keyframes({ from: { transform: "translateY(100%)", opacity: 0 } });
const enterDown = stylex.keyframes({ from: { transform: "translateY(-100%)", opacity: 0 } });
const leaveUp = stylex.keyframes({ to: { transform: "translateY(-100%)", opacity: 0 } });
const leaveDown = stylex.keyframes({ to: { transform: "translateY(100%)", opacity: 0 } });

const styles = stylex.create({
  // Fixed footprint: the buttons and the value share these 112px whatever the state.
  stepper: {
    display: "flex",
    alignItems: "center",
    width: "112px",
    height: "28px",
  },
  button: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    padding: 0,
    overflow: "hidden",
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    color: color.inkSoft,
    cursor: "pointer",
    opacity: 1,
    transform: { default: "scale(1)", ":active": "scale(0.86)" },
    transitionProperty: "width, opacity, transform, background-color, visibility",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.spring,
  },
  gone: {
    width: 0,
    opacity: 0,
    transform: "scale(0.4)",
    visibility: "hidden",
    pointerEvents: "none",
  },
  // The surface that grows into a departed button's space.
  value: {
    flexGrow: 1,
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginInline: "2px",
    borderRadius: radius.round,
    backgroundColor: color.overlayHover,
    transitionProperty: "margin",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.spring,
  },
  digits: {
    display: "inline-flex",
    fontFamily: font.mono,
    fontSize: text.sm,
    lineHeight: "16px",
    color: color.inkSoft,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "pre",
  },
  cell: {
    position: "relative",
    display: "inline-block",
    height: "16px",
    overflow: "hidden",
  },
  roll: {
    display: "block",
    animationDuration: motion.layout,
    animationTimingFunction: motion.spring,
    animationFillMode: "both",
  },
  leaving: { position: "absolute", inset: 0 },
  enterUp: { animationName: enterUp },
  enterDown: { animationName: enterDown },
  leaveUp: { animationName: leaveUp },
  leaveDown: { animationName: leaveDown },
});
