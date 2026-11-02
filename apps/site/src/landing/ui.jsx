// Radix/shadcn semantics (MIT), original Inkling artwork and owned Motion animations.
import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { motion, useInView, AnimatePresence, animate } from "motion/react";
import { useMotionPreference } from "./motion-preference";
import { Cast, cast } from "./Cast";
import { useHydrated } from "./environment";
export const MotionContext = React.createContext(false);
export function useCalm() {
  const system = useMotionPreference(),
    local = React.useContext(MotionContext);
  return system || local;
}
export { Button } from "./Controls";
const subscribeCompactHints = (notify) => {
  const q = window.matchMedia("(max-width: 639px)");
  q.addEventListener("change", notify);
  return () => q.removeEventListener("change", notify);
};
const compactHintsSnapshot = () => window.matchMedia("(max-width: 639px)").matches;
export function MascotHint({
  className = "",
  side = "left",
  character,
  gaze = side === "left" ? "right" : "left",
  label,
  tip,
}) {
  const compact = React.useSyncExternalStore(
    subscribeCompactHints,
    compactHintsSnapshot,
    () => false,
  );
  const reduced = useCalm(),
    [open, setOpen] = React.useState(false),
    [hovered, setHovered] = React.useState(false),
    root = React.useRef(null),
    trigger = React.useRef(null),
    visible = useInView(root, { amount: 0.1 });
  const slots = {
    "hero-peek-left": 0,
    "hero-peek-right": 1,
    "library-peek-left": 2,
    "library-peek-right": 3,
    "saving-companion": 4,
    "finding-companion": 5,
    "privacy-companion": 6,
    "faq-companion": 7,
  };
  const variant = character ?? slots[className] ?? 8,
    person = cast[variant % cast.length],
    alive = !reduced && visible;
  const changeOpen = (next) => setOpen(next);
  return (
    <div
      ref={root}
      className={`mascot-peek ${className}`}
      data-animated-mascot="true"
      data-character={person.name}
      data-gaze={gaze}
    >
      <Popover.Root open={open} onOpenChange={changeOpen}>
        <Popover.Trigger asChild>
          <button
            ref={trigger}
            className={`mascot-button mascot-${side}`}
            aria-label={label}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
          >
            <span className="mascot-character" data-alive={alive}>
              <Cast index={variant} gaze={gaze} alive={alive} engaged={open || hovered} />
            </span>
          </button>
        </Popover.Trigger>
        <AnimatePresence>
          {open && (
            <Popover.Portal forceMount>
              <Popover.Content
                forceMount
                asChild
                side={compact ? "top" : side === "left" ? "right" : "left"}
                align="center"
                sideOffset={8}
                collisionPadding={16}
                style={
                  compact
                    ? {
                        maxWidth:
                          "min(300px, calc(100vw - 48px), var(--radix-popover-content-available-width))",
                      }
                    : undefined
                }
                aria-label={label}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  trigger.current?.focus({ preventScroll: true });
                }}
              >
                <motion.div
                  className="mascot-hint"
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: reduced ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  <p>{tip}</p>
                  <Popover.Close className="hint-close" aria-label="Close hint">
                    ×
                  </Popover.Close>
                </motion.div>
              </Popover.Content>
            </Popover.Portal>
          )}
        </AnimatePresence>
      </Popover.Root>
    </div>
  );
}
// Final states are visible in server markup. Only below-viewport groups are prepared.
// Each local observer unhooks after one entry; calm cancels only its owned animation.
export function Reveal({ children, className = "", delay = 0, ...props }) {
  const reduced = useCalm(),
    ref = React.useRef(null),
    seen = React.useRef(false),
    hydrated = useHydrated();
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !hydrated) return;
    let control, observer;
    const settle = () => {
      control?.cancel();
      el.style.opacity = "1";
      el.style.transform = "none";
    };
    if (reduced) {
      settle();
      seen.current = true;
      return;
    }
    if (seen.current || el.getBoundingClientRect().top < window.innerHeight) {
      seen.current = true;
      return;
    }
    el.style.transform = "translateY(24px)";
    el.style.opacity = ".35";
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen.current = true;
          observer.disconnect();
          control = animate(
            el,
            { opacity: 1, y: 0 },
            { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] },
          );
          el.dataset.entered = "true";
        }
      },
      { threshold: 0, rootMargin: "0px 0px 64px 0px" },
    );
    observer.observe(el);
    return () => {
      observer?.disconnect();
      settle();
    };
  }, [reduced, delay, hydrated]);
  return (
    <div ref={ref} className={className} data-reveal="once" {...props}>
      {children}
    </div>
  );
}
export { Questions } from "./Controls";
