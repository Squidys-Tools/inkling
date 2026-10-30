import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { animate, stagger } from "motion/react";
import { prefersReducedMotion } from "../../ui/reducedMotion";

// GSAP's power3.out, which the headline was tuned with.
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

/**
 * React Bits' Split Text, trimmed to what onboarding uses: a headline whose
 * letters rise into place once, on mount. While split, the heading carries the
 * whole string as its label and the letters are hidden from screen readers.
 */
export function SplitText({
  text,
  className,
  style,
  delay = 0,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
  /** Seconds before the first letter moves. */
  delay?: number;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [done, setDone] = useState(prefersReducedMotion);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || done) return;
    let cancelled = false;
    let stop = () => {};
    // The letters stay invisible until the face has loaded, or they would rise
    // in the fallback font and swap mid-flight.
    const run = () => {
      if (cancelled) return;
      const controls = animate(
        el.querySelectorAll("[data-char]"),
        { opacity: [0, 1], y: [40, 0] },
        { duration: 1.25, ease: easeOutQuart, delay: stagger(0.05, { startDelay: delay }) },
      );
      stop = () => controls.stop();
      void controls.then(() => {
        if (!cancelled) setDone(true);
      });
    };
    if (document.fonts.status === "loaded") run();
    else void document.fonts.ready.then(run);

    return () => {
      cancelled = true;
      stop();
    };
  }, [delay, done]);

  if (done) {
    return (
      <h1 ref={ref} className={className} style={style}>
        {text}
      </h1>
    );
  }
  return (
    <h1 ref={ref} className={className} style={style} aria-label={text}>
      {text.split(" ").map((word, w) => (
        // oxlint-disable-next-line react/no-array-index-key -- a fixed string's words, never reordered.
        <Fragment key={w}>
          {w > 0 && " "}
          <span aria-hidden="true" className="relative inline-block">
            {[...word].map((char, c) => (
              <span
                // oxlint-disable-next-line react/no-array-index-key -- a fixed word's letters, never reordered.
                key={c}
                data-char=""
                className="relative inline-block"
                style={{ opacity: 0 }}
              >
                {char}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </h1>
  );
}
