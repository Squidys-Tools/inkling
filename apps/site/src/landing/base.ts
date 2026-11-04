import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { landing, media } from "./landing.stylex.ts";

// StyleX has no element selectors, so the landing's element defaults live here.
export const base = stylex.create({
  frame: {
    boxSizing: "border-box",
    maxWidth: "1440px",
    width: `calc(100% - ${landing.gutter} * 2)`,
    marginInline: "auto",
  },
  link: {
    color: "inherit",
    textDecoration: "none",
    WebkitTapHighlightColor: "transparent",
  },
  button: {
    font: "inherit",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
  image: { display: "block", maxWidth: "100%", height: "auto" },
  heading: { margin: 0, fontWeight: 400, letterSpacing: "-0.055em" },
  flush: { margin: 0 },
  focus: {
    outline: { default: null, ":focus-visible": `3px solid ${landingColor.ink}` },
    outlineOffset: { default: null, ":focus-visible": "5px" },
  },
  focusOnSheet: {
    outline: { default: null, ":focus-visible": `3px solid ${landingColor.sheetInk}` },
  },
  textLink: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    minHeight: "48px",
    fontSize: "1rem",
    "::after": {
      content: '""',
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "7px",
      height: "2px",
      transform: { default: "scaleX(0)", ":hover": "scaleX(1)" },
      transformOrigin: "left",
      backgroundColor: "currentColor",
      transitionProperty: "transform",
      transitionDuration: { default: "0.28s", [media.reduced]: "0s" },
      transitionTimingFunction: landing.ease,
    },
  },
});
