import * as stylex from "@stylexjs/stylex";
import { Popover } from "@base-ui/react/popover";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useInView } from "motion/react";
import { useRef, useState } from "react";
import { base } from "./base.ts";
import { Cast } from "./Cast.tsx";
import { useCalm, useMediaQuery } from "./environment.ts";
import { landing, media } from "./landing.stylex.ts";

export function MascotHint({
  character,
  side = "left",
  label,
  tip,
  pinned = false,
  style,
}: {
  character: number;
  side?: "left" | "right";
  label: string;
  tip: string;
  pinned?: boolean;
  style: stylex.StyleXStyles;
}) {
  const compact = useMediaQuery("(max-width: 639px)");
  const reduced = useCalm();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const visible = useInView(root, { amount: 0.1 });
  const gaze = side === "left" ? "right" : "left";

  return (
    <div ref={root} {...stylex.props(styles.peek, style)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={label}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          {...stylex.props(base.button, styles.button)}
        >
          <Cast
            index={character}
            gaze={gaze}
            alive={!reduced && visible}
            engaged={open || hovered}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side={compact ? "top" : gaze}
            align="center"
            sideOffset={8}
            collisionPadding={16}
            // A bubble placed in the page lags a frame behind a sticky mascot while scrolling.
            positionMethod={pinned ? "fixed" : "absolute"}
            {...stylex.props(styles.positioner)}
          >
            <Popover.Popup
              aria-label={label}
              initialFocus={close}
              {...stylex.props(styles.bubble, compact && styles.compact, reduced && styles.still)}
            >
              <p {...stylex.props(base.flush)}>{tip}</p>
              <Popover.Close
                ref={close}
                aria-label="Close hint"
                {...stylex.props(base.button, base.focus, styles.close)}
              >
                ×
              </Popover.Close>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

const styles = stylex.create({
  peek: { position: "absolute", zIndex: 3, pointerEvents: "none" },
  button: {
    boxSizing: "border-box",
    position: "relative",
    display: "block",
    width: "100%",
    height: "100%",
    padding: 0,
    borderStyle: "none",
    borderRadius: "50%",
    backgroundColor: "transparent",
    color: landingColor.ink,
    pointerEvents: "auto",
    outline: { default: null, ":focus-visible": `3px solid ${landingColor.ink}` },
    outlineOffset: {
      default: null,
      ":focus-visible": "-40px",
      [media.phone]: { default: null, ":focus-visible": "-24px" },
    },
  },
  positioner: { zIndex: 60 },
  bubble: {
    boxSizing: "border-box",
    position: "relative",
    maxWidth: "min(300px, calc(100vw - 32px))",
    padding: "24px 50px 24px 24px",
    borderRadius: "22px",
    backgroundColor: landingColor.ink,
    color: landingColor.paper,
    fontSize: "1rem",
    lineHeight: 1.45,
    transformOrigin: "var(--transform-origin)",
    opacity: { default: 1, ":is([data-starting-style], [data-ending-style])": 0 },
    transform: {
      default: "scale(1)",
      ":is([data-starting-style], [data-ending-style])": "scale(0.92)",
    },
    transitionProperty: "opacity, transform",
    transitionDuration: { default: "0.2s", "[data-ending-style]": "0.14s" },
    transitionTimingFunction: landing.controlEase,
  },
  compact: { maxWidth: "min(300px, calc(100vw - 48px), var(--available-width))" },
  still: { transitionProperty: "none" },
  close: {
    boxSizing: "border-box",
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
