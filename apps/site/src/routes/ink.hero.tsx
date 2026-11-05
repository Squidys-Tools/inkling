import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { InkHero } from "../ink/hero/InkHero.tsx";

export const Route = createFileRoute("/ink/hero")({
  head: () => ({
    meta: [{ title: "inkling · ink hero prototype" }, { name: "robots", content: "noindex" }],
    links: [
      {
        rel: "preload",
        href: "/media/red-hat-400.ttf",
        as: "font",
        type: "font/ttf",
        crossOrigin: "anonymous",
      },
    ],
  }),
  component: InkHeroPreview,
});

// The preview covers the shared site header so the section is seen as it would open a page.
function InkHeroPreview() {
  return (
    <main {...stylex.props(styles.cover)}>
      <InkHero />
    </main>
  );
}

const styles = stylex.create({
  cover: { position: "fixed", inset: 0, zIndex: 10, overflowY: "auto" },
});
