import * as stylex from "@stylexjs/stylex";
import { Fragment } from "react";

const STAGGER_S = 0.05;

/**
 * React Bits' Split Text, trimmed to what onboarding uses: a headline whose
 * letters rise into place once, on mount. The heading carries the whole string
 * as its label and the letters are hidden from screen readers.
 */
export function SplitText({
  text,
  delay = 0,
  style,
}: {
  text: string;
  /** Seconds before the first letter moves. */
  delay?: number;
  style?: stylex.StyleXStyles;
}) {
  let index = 0;
  return (
    <h1 aria-label={text} {...stylex.props(style)}>
      {text.split(" ").map((word, w) => (
        // oxlint-disable-next-line react/no-array-index-key -- a fixed string's words, never reordered.
        <Fragment key={w}>
          {w > 0 && " "}
          <span aria-hidden="true" {...stylex.props(styles.word)}>
            {[...word].map((char, c) => (
              <span
                // oxlint-disable-next-line react/no-array-index-key -- a fixed word's letters, never reordered.
                key={c}
                {...stylex.props(
                  styles.word,
                  styles.char,
                  styles.delay(delay + index++ * STAGGER_S),
                )}
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

const rise = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(40px)" },
});

const styles = stylex.create({
  // Inline blocks sit on the baseline and would open up taller lines mid-animation.
  word: { position: "relative", display: "inline-block", verticalAlign: "top" },
  char: {
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1.25s",
    // GSAP's power3.out (an ease-out quart), which the headline was tuned with.
    animationTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)",
    animationFillMode: "both",
  },
  delay: (seconds: number) => ({ animationDelay: `${seconds}s` }),
});
