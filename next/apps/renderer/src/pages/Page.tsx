import * as stylex from "@stylexjs/stylex";
import { color, font, space, text } from "@inkling/ui/tokens.stylex";
import type { ReactNode } from "react";

/** The frame every full page shares: a title and a scrolling body. */
export function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section {...stylex.props(styles.page)}>
      <h1 {...stylex.props(styles.title)}>{title}</h1>
      {children}
    </section>
  );
}

const styles = stylex.create({
  page: {
    height: "100%",
    overflow: "auto",
    padding: space.s8,
    display: "flex",
    flexDirection: "column",
    gap: space.s4,
  },
  title: {
    margin: 0,
    fontFamily: font.display,
    fontSize: text.xxl,
    fontWeight: 600,
    color: color.inkStrong,
    letterSpacing: "-0.01em",
  },
});
