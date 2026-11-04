import * as stylex from "@stylexjs/stylex";
import { Popover } from "@base-ui/react/popover";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useInView } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { base } from "./base.ts";
import { Cast } from "./Cast.tsx";
import { useCalm, useMediaQuery } from "./environment.ts";
import { InkHint } from "./InkHint.tsx";
import { media } from "./landing.stylex.ts";

export function MascotHint({
  character,
  side = "left",
  label,
  tip,
  style,
}: {
  character: number;
  side?: "left" | "right";
  label: string;
  tip: string;
  style: stylex.StyleXStyles;
}) {
  const compact = useMediaQuery("(max-width: 639px)");
  const reduced = useCalm();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const actions = useRef<Popover.Root.Actions>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const figure = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const getFigure = useCallback(() => figure.current, []);
  const visible = useInView(root, { amount: 0.1 });
  const alive = !reduced && visible;
  const gaze = side === "left" ? "right" : "left";

  const changeOpen = (next: boolean, details: Popover.Root.ChangeEventDetails) => {
    if (!next) {
      // The bubble goes inert while it is swallowed; move focus now or it falls to <body>.
      if (bubble.current?.contains(document.activeElement))
        trigger.current?.focus({ preventScroll: true });
      if (!reduced) details.preventUnmountOnClose();
    }
    setOpen(next);
  };

  return (
    <div ref={root} {...stylex.props(styles.peek, style)}>
      <Popover.Root open={open} onOpenChange={changeOpen} actionsRef={actions}>
        <Popover.Trigger
          ref={trigger}
          aria-label={label}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          {...stylex.props(base.button, styles.button)}
        >
          <span ref={figure} {...stylex.props(styles.figure)}>
            <Cast index={character} gaze={gaze} alive={alive} engaged={open || hovered} />
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side={compact ? "top" : gaze}
            align="center"
            sideOffset={8}
            collisionPadding={16}
            // Fixed, so the ink layer reaching past the bubble never widens the page.
            positionMethod="fixed"
            {...stylex.props(styles.positioner)}
          >
            <InkHint
              open={open}
              box={bubble}
              label={label}
              tip={tip}
              reduced={reduced}
              compact={compact}
              trigger={trigger}
              getFigure={getFigure}
              onSwallowed={() => actions.current?.unmount()}
            />
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
  figure: {
    display: "block",
    width: "100%",
    height: "100%",
    transformOrigin: "50% 50%",
  },
  positioner: { zIndex: 60 },
});
