import * as stylex from "@stylexjs/stylex";
import { color, font, radius } from "@inkling/ui/tokens.stylex";

// The site's type scale and its two kinds of call to action.
export const type = stylex.create({
  display: {
    margin: 0,
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: "clamp(44px, 7vw, 88px)",
    fontWeight: 600,
    lineHeight: 0.98,
    letterSpacing: "-0.035em",
  },
  heading: {
    margin: 0,
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: "clamp(32px, 4.2vw, 50px)",
    fontWeight: 600,
    lineHeight: 1.04,
    letterSpacing: "-0.03em",
  },
  subheading: {
    margin: 0,
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: "21px",
    fontWeight: 600,
    letterSpacing: "-0.015em",
  },
  lede: {
    maxWidth: "56ch",
    margin: 0,
    color: color.inkSoft,
    fontSize: "19px",
    lineHeight: 1.55,
  },
  body: {
    maxWidth: "60ch",
    margin: 0,
    color: color.inkSoft,
    fontSize: "17px",
    lineHeight: 1.6,
  },
  small: { margin: 0, color: color.muted, fontSize: "14px", lineHeight: 1.55 },
});

const focus = {
  outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  outlineOffset: "3px",
} as const;

export const action = stylex.create({
  primary: {
    display: "inline-flex",
    alignItems: "center",
    height: "48px",
    paddingInline: "24px",
    borderRadius: radius.round,
    backgroundColor: { default: color.ink, ":hover": color.inkStrong },
    color: color.app,
    fontSize: "16px",
    fontWeight: 600,
    textDecoration: "none",
    ...focus,
  },
  secondary: {
    display: "inline-flex",
    alignItems: "center",
    height: "48px",
    paddingInline: "20px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.borderStrong, ":hover": color.muted },
    color: color.inkStrong,
    fontSize: "16px",
    textDecoration: "none",
    ...focus,
  },
  inline: {
    color: { default: color.inkStrong, ":hover": color.accentStrong },
    textDecorationLine: "underline",
    textDecorationColor: color.borderStrong,
    textUnderlineOffset: "4px",
    ...focus,
  },
});
