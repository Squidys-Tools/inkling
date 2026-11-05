import { createFileRoute } from "@tanstack/react-router";
import { Library } from "../ink/library/Library.tsx";
import { seo } from "../layout/seo.ts";

export const Route = createFileRoute("/ink/library")({
  head: () => {
    const tags = seo({
      title: "Library · inkling",
      description: "No folders. Just everything you kept.",
      path: "/ink/library",
    });
    return {
      ...tags,
      links: [
        ...tags.links,
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
  component: Library,
});
