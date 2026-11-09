import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});

/** Text for screen readers only: clipped to a pixel, out of sight but still announced. */
export const srOnly = styles.srOnly;
