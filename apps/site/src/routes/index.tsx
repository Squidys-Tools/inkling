import * as stylex from "@stylexjs/stylex";
import { color, font } from "@inkling/ui/tokens.stylex";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main {...stylex.props(styles.main)}>
      <h1 {...stylex.props(styles.title)}>Save it now. Describe it later.</h1>
    </main>
  );
}

const styles = stylex.create({
  main: { padding: "96px 24px", maxWidth: "1120px", marginInline: "auto" },
  title: { fontFamily: font.display, fontSize: "64px", color: color.inkStrong, margin: 0 },
});
