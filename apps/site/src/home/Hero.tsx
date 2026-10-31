import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { page } from "../layout/page.ts";
import { action, type } from "../parts/type.ts";
import { LibraryDemo } from "./LibraryDemo.tsx";

export function Hero() {
  return (
    <section {...stylex.props(page.column, styles.hero)}>
      <h1 {...stylex.props(type.display, styles.title)}>
        Save anything. Find it by describing it.
      </h1>
      <p {...stylex.props(type.lede)}>
        inkling keeps the articles, images, screenshots, PDFs, notes, quotes and videos you want to
        hold on to in one library on your computer. There are no folders to keep up. You search for
        what you remember.
      </p>
      <div {...stylex.props(styles.actions)}>
        <Link to="/download" {...stylex.props(action.primary)}>
          Download inkling
        </Link>
        <Link to="/features" {...stylex.props(action.secondary)}>
          See what it does
        </Link>
      </div>
      <p {...stylex.props(type.small, styles.platforms)}>
        Free for Windows, Linux and Apple silicon Macs.
      </p>
      <LibraryDemo />
    </section>
  );
}

const styles = stylex.create({
  hero: { paddingTop: { default: "72px", "@media (max-width: 640px)": "40px" } },
  title: { maxWidth: "14ch", marginBottom: "28px" },
  actions: { display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "36px" },
  platforms: { marginTop: "14px", marginBottom: "64px" },
});
