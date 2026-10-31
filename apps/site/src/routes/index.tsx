import * as stylex from "@stylexjs/stylex";
import { color, font } from "@inkling/ui/tokens.stylex";
import { createFileRoute } from "@tanstack/react-router";
import { LibraryDemo } from "../home/LibraryDemo.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main {...stylex.props(styles.main)}>
      <h1 {...stylex.props(styles.title)}>Save anything. Find it by describing it.</h1>
      <p {...stylex.props(styles.lede)}>
        inkling keeps the articles, images, screenshots, PDFs, notes, quotes and videos you want to
        hold on to in one library on your computer. There are no folders to keep up. You search for
        what you remember.
      </p>
      <LibraryDemo />
    </main>
  );
}

const styles = stylex.create({
  main: { paddingBlock: "96px", paddingInline: "24px", maxWidth: "1180px", marginInline: "auto" },
  title: {
    maxWidth: "14ch",
    margin: 0,
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: "clamp(44px, 7vw, 88px)",
    fontWeight: 600,
    lineHeight: 0.98,
    letterSpacing: "-0.035em",
  },
  lede: {
    maxWidth: "56ch",
    marginTop: "28px",
    marginBottom: "48px",
    color: color.inkSoft,
    fontSize: "19px",
    lineHeight: 1.55,
  },
});
