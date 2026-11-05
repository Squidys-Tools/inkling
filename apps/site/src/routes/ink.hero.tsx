import { createFileRoute } from "@tanstack/react-router";
import { InkHero } from "../ink/hero/InkHero.tsx";

export const Route = createFileRoute("/ink/hero")({
  head: () => ({
    meta: [{ title: "inkling · ink hero prototype" }, { name: "robots", content: "noindex" }],
    links: [
      { rel: "preload", href: "/media/ink/hero/ink.webp", as: "image" },
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

function InkHeroPreview() {
  return (
    <main>
      <InkHero />
    </main>
  );
}
