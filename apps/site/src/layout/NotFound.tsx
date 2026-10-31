import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Mascot } from "../../../renderer/src/mascot/Mascot.tsx";
import { action, type } from "../parts/type.ts";
import { page } from "./page.ts";

const curious = { busy: false, face: "curious" } as const;

export function NotFound() {
  return (
    <main {...stylex.props(page.column, styles.main)}>
      <Mascot mood={curious} size={96} />
      <h1 {...stylex.props(type.heading)}>Nothing is saved at this address.</h1>
      <p {...stylex.props(type.body)}>The page may have moved, or the link has a typo in it.</p>
      <Link to="/" {...stylex.props(action.primary)}>
        Go to the home page
      </Link>
    </main>
  );
}

const styles = stylex.create({
  main: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "24px",
    paddingTop: "96px",
    minHeight: "50vh",
  },
});
