import * as stylex from "@stylexjs/stylex";

// The one column every section lines up on.
export const page = stylex.create({
  column: {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "1180px",
    marginInline: "auto",
    paddingInline: { default: "32px", "@media (max-width: 640px)": "20px" },
  },
});
