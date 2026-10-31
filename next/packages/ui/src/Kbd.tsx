import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color, font, radius, space, text } from "./tokens.stylex.ts";

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd {...stylex.props(styles.kbd)}>{children}</kbd>;
}

const styles = stylex.create({
  kbd: {
    display: "inline-flex",
    alignItems: "center",
    minWidth: "20px",
    height: "20px",
    paddingInline: space.s1,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.raised,
    color: color.muted,
    fontFamily: font.mono,
    fontSize: text.xs,
    justifyContent: "center",
  },
});
