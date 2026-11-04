import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "../landing/LandingPage.tsx";
import { seo } from "../layout/seo.ts";
export const Route = createFileRoute("/")({
  head: () => {
    const tags = seo({
      title: "inkling — finally, you can just find it",
      description:
        "A quiet little home for photos and screenshots. Find them later in your own words with inkling.",
      path: "/",
    });
    return {
      ...tags,
      links: [
        ...tags.links,
        {
          rel: "preload",
          href: "/media/red-hat-400.ttf",
          as: "font",
          type: "font/ttf",
          crossOrigin: "anonymous",
        },
        {
          rel: "preload",
          href: "/media/red-hat-700.ttf",
          as: "font",
          type: "font/ttf",
          crossOrigin: "anonymous",
        },
      ],
    };
  },
  component: LandingPage,
});
