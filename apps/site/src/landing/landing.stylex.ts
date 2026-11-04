import * as stylex from "@stylexjs/stylex";

// StyleX emits narrower max-width queries after wider ones, so the narrower wins where
// they overlap. It does not order other queries by key, so keep those exclusive.
export const media = stylex.defineConsts({
  wide: "@media (min-width: 1600px)",
  tablet: "@media (max-width: 1023px)",
  phone: "@media (max-width: 639px)",
  narrow: "@media (max-width: 360px)",
  reduced: "@media (prefers-reduced-motion: reduce)",
  phoneInMotion: "@media (max-width: 639px) and (prefers-reduced-motion: no-preference)",
  reducedAbovePhone: "@media (min-width: 640px) and (prefers-reduced-motion: reduce)",
  hover: "@media (hover: hover) and (pointer: fine)",
});

export const landing = stylex.defineVars({
  font: '"Red Hat", sans-serif',
  display: {
    default: "clamp(3rem, 8.7vw, 8.5rem)",
    "@media (max-width: 639px)": "clamp(2.5rem, 11.65vw, 4.5rem)",
  },
  body: { default: "clamp(1rem, 1.3vw, 1.25rem)", "@media (max-width: 639px)": "1.0625rem" },
  gutter: { default: "clamp(20px, 4vw, 64px)", "@media (max-width: 639px)": "20px" },
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
  controlEase: "cubic-bezier(0.22, 1, 0.36, 1)",
});
