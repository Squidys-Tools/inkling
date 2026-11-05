import { createFileRoute } from "@tanstack/react-router";
import { seo } from "../layout/seo.ts";
import { media } from "../plains/media.ts";
import { Plains } from "../plains/Plains.tsx";

export const Route = createFileRoute("/plains")({
  head: () => {
    const tags = seo({
      title: "inkling",
      description: "For the things you want to come back to.",
      path: "/plains",
    });
    return {
      ...tags,
      links: [
        ...tags.links,
        {
          rel: "preload",
          href: media.newsreader,
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
      ],
    };
  },
  component: Plains,
});
