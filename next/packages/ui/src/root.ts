import * as stylex from "@stylexjs/stylex";
import { color, font } from "./tokens.stylex.ts";

// StyleX has no global selectors, so the document-level reset goes on <html>
// and <body> directly. Everything else is styled where it renders.
const styles = stylex.create({
  html: {
    height: "100%",
    colorScheme: "dark",
    backgroundColor: color.window,
    color: color.ink,
    fontFamily: font.body,
    fontSynthesis: "none",
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
  },
  body: {
    height: "100%",
    margin: 0,
    overflow: "hidden",
  },
  root: {
    height: "100%",
  },
});

export function applyRootStyles(root: HTMLElement) {
  document.documentElement.className = stylex.props(styles.html).className ?? "";
  document.body.className = stylex.props(styles.body).className ?? "";
  root.className = stylex.props(styles.root).className ?? "";
}
