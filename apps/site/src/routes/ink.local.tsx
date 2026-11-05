import { createFileRoute } from "@tanstack/react-router";
import { LocalSection } from "../ink/local/LocalSection.tsx";
import { seo } from "../layout/seo.ts";

export const Route = createFileRoute("/ink/local")({
  head: () => {
    const tags = seo({
      title: "Nothing leaves the glass · inkling",
      description:
        "No account, no cloud. Your library is one SQLite file and your files, in a folder.",
      path: "/ink/local",
    });
    return { ...tags, meta: [...tags.meta, { name: "robots", content: "noindex" }] };
  },
  component: LocalSection,
});
